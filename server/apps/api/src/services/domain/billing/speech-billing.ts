import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from './billing-service'

import { createPaymentRequiredError } from '@proj-airi/http-error-shared'
import { parse } from 'valibot'

import { priceSpeechUsage, speechPricingSchema } from './billing'
import { availableMicroFlux, microFluxToFlux } from './flux-posting'

/** Speech fees follow the character price and post to the same wallet pool as every other metered service. */
export class SpeechBilling {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigKVService,
    private readonly metrics?: RevenueMetrics | null,
  ) {}

  private async pricing() {
    return parse(speechPricingSchema, { fluxPer1kChars: await this.config.getOrThrow('FLUX_PER_1K_CHARS_TTS') })
  }

  /** Rejects when the database wallet cannot cover the estimated fee on top of outstanding fees. */
  async assertCanAfford(userId: string, units: number): Promise<void> {
    const cost = priceSpeechUsage(units, await this.pricing())
    const wallet = await this.billing.getWallet(userId)
    if (wallet.flux <= 0 || availableMicroFlux(wallet) < BigInt(cost)) {
      this.metrics?.ttsPreflightRejections.add(1, { meter: 'tts', reason: 'insufficient_balance' })
      throw createPaymentRequiredError('Insufficient flux')
    }
  }

  /** Posts the final character fee once per request. PostgreSQL owns accumulation, debit, and idempotency. */
  async settle(input: { userId: string, requestId: string, units: number, model: string, provider?: string, turnId?: string }) {
    const pricing = await this.pricing()
    const costMicroFlux = priceSpeechUsage(input.units, pricing)
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
}
