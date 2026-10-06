import type { RevenueMetrics } from '../../../otel'
import type { CostPricing, CostUsage } from './billing'
import type { BillingService } from './billing-service'

import { nonEmpty, parse, picklist, pipe, string } from 'valibot'

import { costPricingSchema, priceLlmCost } from './billing'
import { microFluxToFlux } from './flux-posting'

/**
 * Prices a confirmed provider cost and posts it once to the shared micro-Flux pool.
 * Request evidence stays in the request log. A cost that is unknown posts nothing.
 */
export function createLlmBillingService(billing: BillingService, metrics?: RevenueMetrics | null) {
  return {
    async settleLlmCost(input: {
      provider: string
      userId: string
      requestId: string
      model: string
      usage: CostUsage
      pricing: CostPricing
      pendingReason?: string
    }) {
      const provider = parse(pipe(string(), nonEmpty()), input.provider)
      const costSource = parse(picklist(['provider_reported', 'model_price_table']), input.usage.source)
      const pricing = parse(costPricingSchema, input.pricing)
      const fee = priceLlmCost(input.usage, pricing)
      if (input.pendingReason !== undefined || fee.costMicroFlux === undefined)
        return { pending: true as const, replay: false, charged: 0, requested: 0, costMicroFlux: null, feeFlux: 0 }

      const posted = await billing.postFluxUsage({
        userId: input.userId,
        source: { type: 'llm', id: input.requestId },
        amountMicroFlux: fee.costMicroFlux,
        detail: { provider, model: input.model, generationId: input.usage.generationId, costSource, costUsd: fee.costUsd, pricing },
      })
      if (!posted.replay && posted.charged < posted.requested)
        metrics?.fluxInsufficientBalance.add(1)
      return { ...posted, pending: false as const, costMicroFlux: fee.costMicroFlux, feeFlux: posted.replay ? 0 : microFluxToFlux(fee.costMicroFlux) }
    },
  }
}

export type LlmBillingService = ReturnType<typeof createLlmBillingService>
