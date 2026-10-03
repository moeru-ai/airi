import type { Database } from '../../../libs/db'
import type { RevenueMetrics } from '../../../otel'
import type { RequestObservation } from '../generation-observation'
import type { CostPricing, CostUsage } from './billing'
import type { BillingService } from './billing-service'

import { useLogger } from '@guiiai/logg'
import { and, eq } from 'drizzle-orm'
import { nonEmpty, parse, picklist, pipe, string } from 'valibot'

import { llmBillingReceipt } from '../../../schemas/llm-billing-receipt'
import { generationObservationSchema } from '../generation-observation'
import { billingPolicySchema, costPricingSchema, priceLlmCost } from './billing'

const logger = useLogger('llm-billing')
const settlementMethod = { unresolved: 'unresolved', providerCost: 'provider_cost' }
const settlementStatus = { pending: 'pending', posted: 'posted', cancelled: 'cancelled' }

/** LLM receipts own pricing and provider evidence. Only confirmed monetary amounts enter the wallet. */
export function createLlmBillingService(db: Database, billing: BillingService, metrics?: RevenueMetrics | null) {
  return {
    /** Saves the authorized price before dispatch, independently of diagnostic logging. */
    async beginLlmRequest(input: { userId: string, requestId: string, model: string, policy: unknown }) {
      const policy = parse(billingPolicySchema, input.policy)
      const userId = parse(pipe(string(), nonEmpty()), input.userId)
      const requestId = parse(pipe(string(), nonEmpty()), input.requestId)
      await db.insert(llmBillingReceipt).values({
        userId,
        requestId,
        model: input.model,
        method: settlementMethod.unresolved,
        billingStatus: settlementStatus.pending,
        pendingReason: 'awaiting_result',
        pricing: policy,
      })
    },

    /** Closes only an unresolved intake after the caller confirms no upstream key was dispatched. */
    async cancelUndispatchedLlmRequest(input: { userId: string, requestId: string }) {
      await db.update(llmBillingReceipt).set({
        billingStatus: settlementStatus.cancelled,
        pendingReason: 'not_dispatched',
        settledAt: new Date(),
      }).where(and(
        eq(llmBillingReceipt.userId, input.userId),
        eq(llmBillingReceipt.requestId, input.requestId),
        eq(llmBillingReceipt.method, settlementMethod.unresolved),
        eq(llmBillingReceipt.billingStatus, settlementStatus.pending),
      ))
    },

    /** Confirms a provider fee and posts it once to the shared micro-Flux pool. Missing costs stay pending. */
    async settleLlmCost(input: {
      provider: string
      userId: string
      requestId: string
      model: string
      usage: CostUsage
      pricing: CostPricing
      pendingReason?: string
      observation: RequestObservation
    }) {
      const provider = parse(pipe(string(), nonEmpty()), input.provider)
      const source = parse(picklist(['provider_reported', 'model_price_table']), input.usage.source)
      const observation = parse(generationObservationSchema, {
        ...input.observation,
        ...input.usage,
        userId: input.userId,
        requestId: input.requestId,
        model: input.model,
        fluxConsumed: 0,
      })
      const result = await db.transaction(async (tx) => {
        const key = and(eq(llmBillingReceipt.userId, input.userId), eq(llmBillingReceipt.requestId, input.requestId))
        await tx.insert(llmBillingReceipt).values({ userId: input.userId, requestId: input.requestId, model: input.model, method: settlementMethod.providerCost, billingStatus: settlementStatus.pending, pricing: parse(costPricingSchema, input.pricing) }).onConflictDoNothing({ target: [llmBillingReceipt.userId, llmBillingReceipt.requestId] })
        const [existing] = await tx.select().from(llmBillingReceipt).where(key).for('update')
        if (existing?.billingStatus === settlementStatus.cancelled)
          throw new Error('Cannot settle an undispatched request')
        if (existing?.billingProvider != null && existing.billingProvider !== provider)
          throw new Error('Provider does not match the cost receipt')
        if (existing?.generationId && input.usage.generationId !== existing.generationId)
          throw new Error('Generation ID does not match the cost receipt')
        if (existing?.billingStatus === settlementStatus.posted) {
          if (existing.model !== input.model)
            throw new Error('Model does not match the cost receipt')
          if (existing.precision === 'micro_flux' && priceLlmCost(input.usage, parse(costPricingSchema, existing.pricing)).costMicroFlux !== existing.costMicroFlux)
            throw new Error('LLM replay does not match the original fee')
          if (existing.precision === 'whole_flux') {
            const wallet = await billing.getWallet(input.userId, tx)
            return { charged: existing.chargedFlux!, requested: existing.requestedFlux!, costMicroFlux: existing.costMicroFlux, balance: wallet.flux, unsettledMicroFlux: wallet.unsettledMicroFlux, pending: false, replay: true }
          }
          const result = await billing.postFluxUsage({ userId: input.userId, source: { type: 'llm', id: input.requestId }, amountMicroFlux: existing.costMicroFlux! }, tx)
          return { ...result, costMicroFlux: existing.costMicroFlux, pending: false }
        }
        if (existing && !Object.values(settlementMethod).includes(existing.method))
          throw new Error('Billing method does not match the usage')
        let savedPricing: unknown = input.pricing
        if (existing?.method === settlementMethod.providerCost) {
          savedPricing = existing.pricing
        }
        else if (existing?.method === settlementMethod.unresolved) {
          const policy = parse(billingPolicySchema, existing.pricing)
          savedPricing = policy.costPricing[provider]
          if (!savedPricing)
            throw new Error('Provider cost pricing was not authorized for this request')
        }
        const pricing = parse(costPricingSchema, savedPricing)
        const fee = priceLlmCost(input.usage, pricing)
        const receipt = {
          userId: input.userId,
          requestId: input.requestId,
          model: input.model,
          attemptId: observation.attemptId,
          method: settlementMethod.providerCost,
          billingProvider: provider,
          billingStatus: settlementStatus.pending,
          pendingReason: input.pendingReason ?? fee.pendingReason ?? 'awaiting_settlement',
          generationId: input.usage.generationId,
          providerUsage: observation.providerUsage,
          costSource: source,
          costUsd: fee.costUsd?.toString(),
          pricing,
        }
        const [usage] = await tx.insert(llmBillingReceipt).values(receipt).onConflictDoUpdate({
          target: [llmBillingReceipt.userId, llmBillingReceipt.requestId],
          set: receipt,
        }).returning()
        if (input.pendingReason !== undefined || fee.costMicroFlux === undefined) {
          const wallet = await billing.getWallet(input.userId, tx)
          return { charged: 0, requested: 0, costMicroFlux: null, balance: wallet.flux, unsettledMicroFlux: wallet.unsettledMicroFlux, pending: true, replay: false }
        }
        const posted = await billing.postFluxUsage({ userId: input.userId, source: { type: 'llm', id: input.requestId }, amountMicroFlux: fee.costMicroFlux }, tx)
        await tx.update(llmBillingReceipt).set({ costMicroFlux: fee.costMicroFlux, billingStatus: settlementStatus.posted, pendingReason: null, settledAt: new Date() }).where(eq(llmBillingReceipt.id, usage!.id))
        return { ...posted, costMicroFlux: fee.costMicroFlux, pending: false }
      }).catch((error) => {
        logger.withError(error).withFields({
          event: 'llm.billing_receipt',
          billingStatus: 'failed',
          userId: input.userId,
          requestId: input.requestId,
          generationId: input.usage.generationId,
          provider,
        }).error('Failed to persist LLM billing receipt')
        throw error
      })
      if (!result.pending && !result.replay) {
        await billing.syncFluxCache(input.userId, result.balance)
        if (result.charged < result.requested)
          metrics?.fluxInsufficientBalance.add(1)
      }
      return result
    },

  }
}

export type LlmBillingService = ReturnType<typeof createLlmBillingService>
