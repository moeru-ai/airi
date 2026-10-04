export type PlanSettlement = 'taken' | 'wallet' | 'stopped'

/** The plan-Credit operations chat and speech settlement need. */
export interface PlanCreditAccount {
  getStatus: (userId: string) => Promise<{ allowances: Array<{ remainingMicro: number }> }>
  getFallbackPreference: (userId: string) => Promise<boolean>
  debitCredits: (input: {
    userId: string
    amountMicro: number
    requestId: string
  }) => Promise<{ chargedMicro: number, requestedMicro: number }>
}

/**
 * Spends plan Credits when they cover the whole fee.
 * Otherwise the caller posts the same micro-Credit amount to the Flux wallet
 * only when the user turned Flux fallback on.
 */
export async function takePlanCredits(
  subscriptions: PlanCreditAccount | null | undefined,
  input: { userId: string, requestId: string, amountMicro: number },
): Promise<PlanSettlement> {
  if (!subscriptions || input.amountMicro <= 0)
    return 'wallet'

  const status = await subscriptions.getStatus(input.userId)
  const remainingMicro = status.allowances.reduce((sum, allowance) => sum + allowance.remainingMicro, 0)
  if (remainingMicro >= input.amountMicro) {
    const debit = await subscriptions.debitCredits({
      userId: input.userId,
      requestId: input.requestId,
      amountMicro: input.amountMicro,
    })
    if (debit.chargedMicro >= input.amountMicro)
      return 'taken'
  }

  const fallbackToFlux = await subscriptions.getFallbackPreference(input.userId)
  return fallbackToFlux ? 'wallet' : 'stopped'
}
