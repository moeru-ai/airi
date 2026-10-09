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
  planFlux: number
  planExpiresAt: Date | null
  fallbackToFlux: boolean
}

/**
 * Whole Flux each bucket can fund now.
 * An expired plan counts as 0. While a plan is active, purchased Flux pays only when `fallbackToFlux` is on.
 */
function spendableBuckets(wallet: PooledWallet, now: Date = new Date()): { plan: number, purchased: number } {
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

/** The wallet columns that decide when the plan bucket refills. */
export interface PlanBucket {
  planFlux: number
  planQuota: number
  planExpiresAt: Date | null
  planPeriodStart: Date | null
  planFilledAt: Date | null
  planResetAt: Date | null
}

/** Reset rules that apply to every wallet. */
export interface PlanResetPolicy {
  /** Length of one refill window inside a billing period. Null refills once per billing period. */
  intervalMs: number | null
  /** Refills every active plan once at this time. */
  resetAt: Date | null
}

const RESET_INTERVAL_MS = { day: 86_400_000, week: 604_800_000 }

export async function readPlanResetPolicy(configKV: Pick<ConfigKVService, 'getOptional'>): Promise<PlanResetPolicy> {
  const interval = await configKV.getOptional('PLAN_FLUX_RESET_INTERVAL')
  const resetAt = await configKV.getOptional('PLAN_FLUX_RESET_AT')
  return {
    intervalMs: interval ? RESET_INTERVAL_MS[interval] : null,
    resetAt: resetAt ? new Date(resetAt) : null,
  }
}

/**
 * The latest time at which the plan bucket must be full. Null when no plan is active.
 * It is the latest of the billing period start, the current reset window,
 * and the admin reset times. Windows count from the billing period start.
 * A reset time in the future does not count yet.
 */
function planRefillBoundary(plan: PlanBucket, policy: PlanResetPolicy, now: Date): Date | null {
  if (plan.planPeriodStart === null || plan.planExpiresAt === null || plan.planExpiresAt <= now)
    return null
  const start = plan.planPeriodStart.getTime()
  let boundary = start
  if (policy.intervalMs !== null && now.getTime() > start)
    boundary = start + Math.floor((now.getTime() - start) / policy.intervalMs) * policy.intervalMs
  for (const resetAt of [policy.resetAt, plan.planResetAt]) {
    if (resetAt !== null && resetAt <= now)
      boundary = Math.max(boundary, resetAt.getTime())
  }
  return new Date(boundary)
}

/**
 * Fills the plan bucket to the quota when the last refill is before the boundary.
 * Unused plan Flux is forfeit. An earlier boundary never refills, so a return
 * to an older billing period keeps the spent amount.
 */
export function refillPlan<T extends PlanBucket>(plan: T, policy: PlanResetPolicy, now: Date = new Date()): T & { refilled: boolean } {
  const boundary = planRefillBoundary(plan, policy, now)
  if (boundary === null || (plan.planFilledAt !== null && plan.planFilledAt >= boundary))
    return { ...plan, refilled: false }
  return {
    ...plan,
    planFlux: plan.planQuota,
    // A period start can be a moment ahead of this clock. The later time stops a second refill.
    planFilledAt: boundary > now ? boundary : now,
    refilled: true,
  }
}

/** Whole percent of the plan quota left. Null when no plan is active. */
export function planRemainingPercent(wallet: Pick<PooledWallet, 'planFlux' | 'planExpiresAt'> & { planQuota: number }, now: Date = new Date()): number | null {
  if (wallet.planExpiresAt === null || wallet.planExpiresAt <= now || wallet.planQuota <= 0)
    return null
  return Math.min(100, Math.max(0, Math.round(wallet.planFlux / wallet.planQuota * 100)))
}
