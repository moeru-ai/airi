export type UsageMeter = 'plan' | 'wallet' | 'unbilled'

/** One whole fee after settlement chooses a pool. */
export interface UsageSettlement {
  meter: UsageMeter
  /** Micro-Credits of the fee. */
  micro: number
  replay: boolean
}

/** Plan Credit operations shared by chat and speech. */
export interface PlanCreditAccount {
  /** Remaining micro-Credits on the earliest open period. */
  spendableMicro: (userId: string) => Promise<number>
  getFallbackPreference: (userId: string) => Promise<boolean>
  debitCredits: (input: {
    userId: string
    microCredit: number
    requestId: string
  }) => Promise<{ chargedMicro: number, requestedMicro: number, replay: boolean }>
}

interface UsageSettlementDeps {
  plans?: PlanCreditAccount | null
  /** Spendable wallet balance in micro-Credits. */
  walletMicro: (userId: string) => Promise<bigint>
}

/**
 * Pays one whole fee from plan Credits or the Flux wallet.
 * The earliest open Credit period pays when it covers the whole fee.
 * Otherwise the wallet pays when Flux fallback is on.
 * A short period stays untouched. The two pools are not combined.
 */
export function createUsageSettlement(deps: UsageSettlementDeps) {
  async function planCovers(userId: string, micro: number): Promise<boolean> {
    if (!deps.plans)
      return false
    return await deps.plans.spendableMicro(userId) >= micro
  }

  /**
   * Returns true when one pool can pay `micro` by itself.
   * With no plan account, only the wallet is checked.
   */
  async function canCover(userId: string, micro: number): Promise<boolean> {
    if (micro <= 0)
      return true
    if (await planCovers(userId, micro))
      return true
    if (deps.plans && !await deps.plans.getFallbackPreference(userId))
      return false
    return await deps.walletMicro(userId) >= BigInt(micro)
  }

  /**
   * Posts the fee once.
   * A zero fee still calls `postWallet` so the wallet ledger keeps its replay rules.
   * `postWallet` runs only when the plan does not take the fee.
   */
  async function settle(input: {
    userId: string
    requestId: string
    micro: number
    postWallet: () => Promise<{ replay: boolean }>
  }): Promise<UsageSettlement> {
    if (input.micro > 0 && deps.plans && await planCovers(input.userId, input.micro)) {
      const debit = await deps.plans.debitCredits({
        userId: input.userId,
        requestId: input.requestId,
        microCredit: input.micro,
      })
      if (debit.chargedMicro >= input.micro)
        return { meter: 'plan', micro: input.micro, replay: debit.replay }
    }

    if (input.micro > 0 && deps.plans && !await deps.plans.getFallbackPreference(input.userId))
      return { meter: 'unbilled', micro: input.micro, replay: false }

    const posted = await input.postWallet()
    return { meter: 'wallet', micro: input.micro, replay: posted.replay }
  }

  return { canCover, settle }
}
