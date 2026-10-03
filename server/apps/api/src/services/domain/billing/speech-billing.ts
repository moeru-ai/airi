import type { Database } from '../../../libs/db'
import type { RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { BillingService } from './billing-service'

import { and, eq } from 'drizzle-orm'
import { parse } from 'valibot'

import { speechBillingReceipt } from '../../../schemas/speech-billing-receipt'
import { createPaymentRequiredError } from '../../../utils/error'
import { MICRO_FLUX_PER_FLUX, priceSpeechUsage, speechPricingSchema } from './billing'

/** Speech pricing and admission use the same durable wallet as all other metered services. */
export class SpeechBilling {
  constructor(
    private readonly db: Database,
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
    await this.beginSpeechUsage({ userId, ...event, pricing })
  }

  async beginSpeechUsage(input: { userId: string, requestId: string, model: string, pricing: unknown, turnId?: string }) {
    const pricing = parse(speechPricingSchema, input.pricing)
    await this.db.insert(speechBillingReceipt).values({ ...input, pricing, status: 'pending' }).onConflictDoNothing({ target: [speechBillingReceipt.userId, speechBillingReceipt.requestId] })
  }

  async settleSpeechUsage(input: { userId: string, requestId: string, units: number, model: string, provider?: string, turnId?: string }) {
    const result = await this.db.transaction(async (tx) => {
      const [receipt] = await tx.select().from(speechBillingReceipt).where(and(eq(speechBillingReceipt.userId, input.userId), eq(speechBillingReceipt.requestId, input.requestId))).for('update')
      if (!receipt)
        throw new Error('Speech usage intake is missing')
      if (receipt.model !== input.model)
        throw new Error('Speech model does not match its authorized receipt')
      if (receipt.status === 'posted' && (receipt.units !== input.units || receipt.provider !== (input.provider ?? null)))
        throw new Error('Speech replay does not match the original receipt')
      const amountMicroFlux = priceSpeechUsage(input.units, parse(speechPricingSchema, receipt.pricing))
      const posted = await this.billing.postFluxUsage({ userId: input.userId, source: { type: 'tts', id: input.requestId }, amountMicroFlux }, tx)
      if (!posted.replay)
        await tx.update(speechBillingReceipt).set({ status: 'posted', units: input.units, provider: input.provider, postedAt: new Date() }).where(eq(speechBillingReceipt.id, receipt.id))
      return { ...posted, costMicroFlux: amountMicroFlux }
    })
    if (!result.replay)
      await this.billing.syncFluxCache(input.userId, result.balance)
    return result
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
    const result = await this.settleSpeechUsage({
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
