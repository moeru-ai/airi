import type { InferOutput } from 'valibot'

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
  planFlux: number
  planExpiresAt: Date | null
  fallbackToFlux: boolean
}

/**
 * Whole Flux each bucket can fund now.
 * An expired plan counts as 0. While a plan is active, purchased Flux pays only when `fallbackToFlux` is on.
 */
export function spendableBuckets(wallet: PooledWallet, now: Date = new Date()): { plan: number, purchased: number } {
  const planActive = wallet.planExpiresAt !== null && wallet.planExpiresAt > now
  return {
    plan: planActive ? Math.max(0, wallet.planFlux) : 0,
    purchased: !planActive || wallet.fallbackToFlux ? Math.max(0, wallet.flux) : 0,
  }
}

/** Whole Flux that admission can count on. */
export function spendableFlux(wallet: PooledWallet, now?: Date): number {
  const { plan, purchased } = spendableBuckets(wallet, now)
  return plan + purchased
}

/** Spendable Flux minus confirmed outstanding fees, in micro-Flux. Admission uses this one formula. */
export function availableMicroFlux(wallet: PooledWallet, now?: Date): bigint {
  return BigInt(spendableFlux(wallet, now)) * BigInt(MICRO_FLUX_PER_FLUX) - BigInt(wallet.unsettledMicroFlux)
}

/** Settles whole Flux out of the outstanding fees. The plan bucket pays first, then purchased Flux. */
export function settleOutstandingMicroFlux(wallet: PooledWallet, now?: Date) {
  const { plan, purchased } = spendableBuckets(wallet, now)
  const requested = Math.floor(wallet.unsettledMicroFlux / MICRO_FLUX_PER_FLUX)
  const fromPlan = Math.min(requested, plan)
  const fromPurchased = Math.min(requested - fromPlan, purchased)
  const charged = fromPlan + fromPurchased
  return {
    requested,
    charged,
    fromPlan,
    fromPurchased,
    planFlux: wallet.planFlux - fromPlan,
    flux: wallet.flux - fromPurchased,
    unsettledMicroFlux: wallet.unsettledMicroFlux - charged * MICRO_FLUX_PER_FLUX,
  }
}

/** Whole percent of the plan quota left. Null when no plan is active. */
export function planRemainingPercent(wallet: Pick<PooledWallet, 'planFlux' | 'planExpiresAt'> & { planQuota: number }, now: Date = new Date()): number | null {
  if (wallet.planExpiresAt === null || wallet.planExpiresAt <= now || wallet.planQuota <= 0)
    return null
  return Math.min(100, Math.max(0, Math.round(wallet.planFlux / wallet.planQuota * 100)))
}
