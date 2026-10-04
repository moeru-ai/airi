/**
 * One Credit equals one Flux.
 * Both pools settle with this scale: 1 Credit = 1,000,000 micro-Credits.
 */
export const MICRO_PER_CREDIT = 1_000_000

export interface CreditPool {
  /** Whole Credits still available to settle. */
  credits: number
  /** Micro-Credits not yet settled into a whole Credit. */
  unsettledMicro: number
}

/** Whole Credits the pool can still fund, in micro-Credits. */
export function availableMicroCredits(pool: CreditPool): bigint {
  return BigInt(pool.credits) * BigInt(MICRO_PER_CREDIT) - BigInt(pool.unsettledMicro)
}

/**
 * Settles whole Credits out of an unsettled micro-Credit balance.
 * The integer debit never exceeds `credits`. The remainder stays unsettled.
 */
export function settleMicroCredits(pool: CreditPool): CreditPool & { chargedCredits: number } {
  const requested = Math.floor(pool.unsettledMicro / MICRO_PER_CREDIT)
  const chargedCredits = Math.min(requested, Math.max(0, pool.credits))
  return {
    credits: pool.credits - chargedCredits,
    unsettledMicro: pool.unsettledMicro - chargedCredits * MICRO_PER_CREDIT,
    chargedCredits,
  }
}

/** Adds a micro-Credit fee, then settles whole Credits. */
export function postMicroCredits(pool: CreditPool, microCredit: number): CreditPool & { chargedCredits: number } {
  return settleMicroCredits({
    credits: pool.credits,
    unsettledMicro: pool.unsettledMicro + microCredit,
  })
}
