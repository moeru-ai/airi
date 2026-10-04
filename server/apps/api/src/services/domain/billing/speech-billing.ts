import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from './billing-service'
import type { PlanCreditAccount } from './credit-settlement'

import { parse } from 'valibot'

import { createPaymentRequiredError } from '../../../utils/error'
import { priceSpeechUsage, speechPricingSchema } from './billing'
import { takePlanCredits } from './credit-settlement'
import { availableMicroFlux, microFluxToFlux } from './flux-posting'

/** Speech fees follow the character price. Plan Credits settle before the wallet. */
export class SpeechBilling {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigKVService,
    private readonly metrics?: RevenueMetrics | null,
    private readonly subscriptions?: PlanCreditAccount | null,
  ) {}

  private async pricing() {
    return parse(speechPricingSchema, { fluxPer1kChars: await this.config.getOrThrow('FLUX_PER_1K_CHARS_TTS') })
  }

  /** Rejects when plan Credits and, when fallback is on, the wallet cannot cover the fee. */
  async assertCanAfford(userId: string, units: number): Promise<void> {
    const cost = priceSpeechUsage(units, await this.pricing())
    const planMicro = await this.planRemainingMicro(userId)
    if (planMicro >= BigInt(cost))
      return
    const fallbackToFlux = this.subscriptions
      ? await this.subscriptions.getFallbackPreference(userId)
      : true
    const wallet = await this.billing.getWallet(userId)
    const walletCovers = wallet.flux > 0 && availableMicroFlux(wallet) >= BigInt(cost)
    if (fallbackToFlux && walletCovers)
      return
    this.metrics?.ttsPreflightRejections.add(1, { meter: 'tts', reason: 'insufficient_balance' })
    throw createPaymentRequiredError('Insufficient flux')
  }

  /** Posts the final character fee once per request. Plan Credits settle before the wallet. */
  async settle(input: { userId: string, requestId: string, units: number, model: string, provider?: string, turnId?: string }) {
    const pricing = await this.pricing()
    const costMicroFlux = priceSpeechUsage(input.units, pricing)
    const settlement = await takePlanCredits(this.subscriptions, {
      userId: input.userId,
      requestId: input.requestId,
      microCredit: costMicroFlux,
    })
    if (settlement === 'taken' || settlement === 'stopped') {
      if (settlement === 'taken')
        this.metrics?.ttsChars.add(input.units, { meter: 'tts', model: input.model })
      return { charged: 0, requested: 0, replay: false, costMicroFlux, feeFlux: settlement === 'taken' ? microFluxToFlux(costMicroFlux) : 0, unsettledMicroFlux: 0 }
    }
    const result = await this.billing.postFluxUsage({
      userId: input.userId,
      source: { type: 'tts', id: input.requestId },
      amountMicroFlux: costMicroFlux,
      detail: { units: input.units, model: input.model, provider: input.provider, turnId: input.turnId, pricing },
    })
    if (!result.replay)
      this.metrics?.ttsChars.add(input.units, { meter: 'tts', model: input.model })
    return { ...result, costMicroFlux, feeFlux: result.replay ? 0 : microFluxToFlux(costMicroFlux) }
  }

  private async planRemainingMicro(userId: string): Promise<bigint> {
    if (!this.subscriptions)
      return 0n
    const status = await this.subscriptions.getStatus(userId)
    return status.allowances.reduce((sum, allowance) => sum + BigInt(allowance.remainingMicro), 0n)
  }
}
