import type { InferOutput } from 'valibot'

import type { ConfigKVService } from '../../adapters/config-kv'

import { minValue, nonEmpty, number, object, optional, pipe, record, safeInteger, string, unknown } from 'valibot'

export const MICRO_FLUX_PER_FLUX = 1_000_000

/** Source identity scopes idempotency per wallet. Zero is a confirmed amount and still creates a usage record. */
export const fluxUsageInputSchema = object({
  userId: pipe(string(), nonEmpty()),
  source: object({ type: pipe(string(), nonEmpty()), id: pipe(string(), nonEmpty()) }),
  amountMicroFlux: pipe(number(), safeInteger(), minValue(0)),
  detail: optional(record(string(), unknown())),
})
export type FluxUsageInput = InferOutput<typeof fluxUsageInputSchema>

/** Converts a micro-Flux fee to Flux for telemetry. */
export function microFluxToFlux(microFlux: number): number {
  return microFlux / MICRO_FLUX_PER_FLUX
}

/** The wallet columns that decide what a user can spend. */
export interface PooledWallet {
  flux: number
  unsettledMicroFlux: number
  capacitorFlux: number
  capacitorExpiresAt: Date | null
  fallbackToFlux: boolean
}

/**
 * Whole Flux each bucket can fund now.
 * An expired capacitor counts as 0. While a capacitor is active, purchased Flux pays only when `fallbackToFlux` is on.
 */
function spendableBuckets(wallet: PooledWallet, now: Date = new Date()): { capacitor: number, purchased: number } {
  const capacitorActive = wallet.capacitorExpiresAt !== null && wallet.capacitorExpiresAt > now
  return {
    capacitor: capacitorActive ? Math.max(0, wallet.capacitorFlux) : 0,
    purchased: !capacitorActive || wallet.fallbackToFlux ? Math.max(0, wallet.flux) : 0,
  }
}

/** Whole Flux that admission can count on. */
export function spendableFlux(wallet: PooledWallet, now?: Date): number {
  const { capacitor, purchased } = spendableBuckets(wallet, now)
  return capacitor + purchased
}

/** Spendable Flux minus confirmed outstanding fees, in micro-Flux. Admission uses this one formula. */
export function availableMicroFlux(wallet: PooledWallet, now?: Date): bigint {
  return BigInt(spendableFlux(wallet, now)) * BigInt(MICRO_FLUX_PER_FLUX) - BigInt(wallet.unsettledMicroFlux)
}

/** Settles whole Flux out of the outstanding fees. The capacitor bucket pays first, then purchased Flux. */
export function settleOutstandingMicroFlux(wallet: PooledWallet, now?: Date) {
  const { capacitor, purchased } = spendableBuckets(wallet, now)
  const requested = Math.floor(wallet.unsettledMicroFlux / MICRO_FLUX_PER_FLUX)
  const fromCapacitor = Math.min(requested, capacitor)
  const fromPurchased = Math.min(requested - fromCapacitor, purchased)
  const charged = fromCapacitor + fromPurchased
  return {
    requested,
    charged,
    fromCapacitor,
    fromPurchased,
    capacitorFlux: wallet.capacitorFlux - fromCapacitor,
    flux: wallet.flux - fromPurchased,
    unsettledMicroFlux: wallet.unsettledMicroFlux - charged * MICRO_FLUX_PER_FLUX,
  }
}

/** The wallet columns that decide when the capacitor bucket refills. */
export interface CapacitorBucket {
  capacitorFlux: number
  capacitorQuota: number
  capacitorExpiresAt: Date | null
  capacitorPeriodStart: Date | null
  capacitorFilledAt: Date | null
  capacitorResetAt: Date | null
}

/** Reset rules that apply to every wallet. */
export interface CapacitorResetPolicy {
  /** Length of one refill window inside a billing period. Null refills once per billing period. */
  intervalMs: number | null
  /** Refills every active capacitor once at this time. */
  resetAt: Date | null
}

const RESET_INTERVAL_MS = { day: 86_400_000, week: 604_800_000 }

export async function readCapacitorResetPolicy(configKV: Pick<ConfigKVService, 'getOptional'>): Promise<CapacitorResetPolicy> {
  const interval = await configKV.getOptional('CAPACITOR_RESET_INTERVAL')
  const resetAt = await configKV.getOptional('CAPACITOR_RESET_AT')
  return {
    intervalMs: interval ? RESET_INTERVAL_MS[interval] : null,
    resetAt: resetAt ? new Date(resetAt) : null,
  }
}

/**
 * The latest time at which the capacitor bucket must be full. Null when no capacitor is active.
 * It is the latest of the billing period start, the current reset window,
 * and the admin reset times. Windows count from the billing period start.
 * A reset time in the future does not count yet.
 */
function capacitorRefillBoundary(capacitor: CapacitorBucket, policy: CapacitorResetPolicy, now: Date): Date | null {
  if (capacitor.capacitorPeriodStart === null || capacitor.capacitorExpiresAt === null || capacitor.capacitorExpiresAt <= now)
    return null
  const start = capacitor.capacitorPeriodStart.getTime()
  let boundary = start
  if (policy.intervalMs !== null && now.getTime() > start)
    boundary = start + Math.floor((now.getTime() - start) / policy.intervalMs) * policy.intervalMs
  for (const resetAt of [policy.resetAt, capacitor.capacitorResetAt]) {
    if (resetAt !== null && resetAt <= now)
      boundary = Math.max(boundary, resetAt.getTime())
  }
  return new Date(boundary)
}

/**
 * Fills the capacitor bucket to the quota when the last refill is before the boundary.
 * Unused capacitor Flux is forfeit. An earlier boundary never refills, so a return
 * to an older billing period keeps the spent amount.
 */
export function refillCapacitor<T extends CapacitorBucket>(capacitor: T, policy: CapacitorResetPolicy, now: Date = new Date()): T & { refilled: boolean } {
  const boundary = capacitorRefillBoundary(capacitor, policy, now)
  if (boundary === null || (capacitor.capacitorFilledAt !== null && capacitor.capacitorFilledAt >= boundary))
    return { ...capacitor, refilled: false }
  return {
    ...capacitor,
    capacitorFlux: capacitor.capacitorQuota,
    // A period start can be a moment ahead of this clock. The later time stops a second refill.
    capacitorFilledAt: boundary > now ? boundary : now,
    refilled: true,
  }
}

/** Whole percent of the capacitor quota left. Null when no capacitor is active. */
export function capacitorPercent(wallet: Pick<PooledWallet, 'capacitorFlux' | 'capacitorExpiresAt'> & { capacitorQuota: number }, now: Date = new Date()): number | null {
  if (wallet.capacitorExpiresAt === null || wallet.capacitorExpiresAt <= now || wallet.capacitorQuota <= 0)
    return null
  return Math.min(100, Math.max(0, Math.round(wallet.capacitorFlux / wallet.capacitorQuota * 100)))
}
