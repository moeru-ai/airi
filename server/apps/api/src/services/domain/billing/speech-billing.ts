import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from './billing-service'

import { parse } from 'valibot'

import { createPaymentRequiredError } from '../../../utils/error'
import { MICRO_FLUX_PER_FLUX, priceSpeechUsage, speechPricingSchema } from './billing'

/** Speech pricing and admission use the same durable wallet as all other metered services. */
export class SpeechBilling {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigKVService,
    private readonly metrics?: RevenueMetrics | null,
  ) {}

  /** Saves the authorized character price before dispatch. The balance argument is a caller snapshot for diagnostics only. */
  async assertCanAfford(
    userId: string,
    units: number,
    _currentBalance: number,
    event: { requestId: string, model: string, turnId?: string },
  ): Promise<void> {
    const pricing = parse(speechPricingSchema, { fluxPer1kChars: await this.config.getOrThrow('FLUX_PER_1K_CHARS_TTS') })
    const wallet = await this.billing.getWallet(userId)
    const cost = priceSpeechUsage(units, pricing)
    if (wallet.flux <= 0 || BigInt(wallet.flux) * BigInt(MICRO_FLUX_PER_FLUX) < BigInt(wallet.unsettledMicroFlux) + BigInt(cost)) {
      this.metrics?.ttsPreflightRejections.add(1, { meter: 'tts', reason: 'insufficient_balance' })
      throw createPaymentRequiredError('Insufficient flux')
    }
    await this.billing.beginSpeechUsage({ userId, ...event, pricing })
  }

  /** Confirms the final character count. PostgreSQL owns accumulation, debit, and idempotency. */
  async accumulate(input: {
    userId: string
    units: number
    currentBalance: number
    requestId: string
    metadata: { model: string, costMultiplier?: number }
    turnId?: string
    provider?: string
  }) {
    const result = await this.billing.settleSpeechUsage({
      userId: input.userId,
      requestId: input.requestId,
      units: input.units,
      model: input.metadata.model,
      turnId: input.turnId,
      provider: input.provider,
    })
    if (!result.replay)
      this.metrics?.ttsChars.add(input.units, { meter: 'tts', model: input.metadata.model })
    return {
      fluxDebited: result.charged,
      balanceAfter: result.balance,
      unsettledMicroFlux: result.unsettledMicroFlux,
      costMicroFlux: result.costMicroFlux,
      unbilledFlux: result.requested - result.charged,
      replay: result.replay,
    }
  }
}
