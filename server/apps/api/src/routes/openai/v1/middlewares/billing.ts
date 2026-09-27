import type { RevenueMetrics } from '../../../../otel'
import type { ConfigKVService } from '../../../../services/adapters/config-kv'
import type { BillingPolicy, CostPricing, CostUsage } from '../../../../services/domain/billing/billing'
import type { BillingService } from '../../../../services/domain/billing/billing-service'
import type { FluxMeter } from '../../../../services/domain/billing/flux-meter'
import type { FluxService } from '../../../../services/domain/flux'
import type { RequestObservation } from '../../../../services/domain/generation-observation'
import type { UsageInfo } from '../../../../services/domain/generation-usage'

import { safeParse } from 'valibot'

import { resolveProviderCostAdapter } from '../../../../services/adapters/llm/cost'
import { billingPolicySchema, priceLlmCost } from '../../../../services/domain/billing/billing'
import { createPaymentRequiredError, createServiceUnavailableError } from '../../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../../utils/observability'

export interface ChatFluxDebitInput extends UsageInfo {
  billingService: BillingService
  revenue?: RevenueMetrics | null
  userId: string
  requestId: string
  model: string
  amount: number
  observation: RequestObservation
  costReceipt: { provider: string, usage: CostUsage, pricing: CostPricing }
  pendingReason?: string
  stage: 'streaming' | 'non_streaming'
  logger: {
    withFields: (fields: Record<string, unknown>) => {
      warn: (message: string) => void
    }
  }
}

export type ChatBillingPolicy = BillingPolicy

interface ChatUsagePrice {
  amount: number
  costReceipt: ChatFluxDebitInput['costReceipt']
}

export interface TtsBillingAuthorization {
  balance: number
  inputChars: number
}

export interface OpenAiRouteBilling {
  authorizeChat: (userId: string) => Promise<ChatBillingPolicy>
  authorizeDispatch: (policy: ChatBillingPolicy, route: { gateway: string, model: string }) => void
  authorizeTts: (userId: string, inputText: string) => Promise<TtsBillingAuthorization>
  priceChatUsage: (usage: UsageInfo, policy: ChatBillingPolicy, provider: string) => ChatUsagePrice
  recordChatDebitFailure: (input: {
    amount: number
    model: string
    stage: 'streaming' | 'non_streaming'
  }) => void
  settleChat: (input: Omit<ChatFluxDebitInput, 'billingService' | 'revenue'>) => Promise<number>
  settleTts: (input: {
    userId: string
    inputText: string
    currentBalance: number
    requestId: string
    model: string
  }) => Promise<{ fluxDebited: number }>
}

export function createOpenAiRouteBilling(deps: {
  billingService: BillingService
  configKV: ConfigKVService
  fluxService: FluxService
  revenue?: RevenueMetrics | null
  ttsMeter: FluxMeter
}): OpenAiRouteBilling {
  async function authorizeChat(userId: string): Promise<ChatBillingPolicy> {
    const costPricing = await deps.configKV.getOptional('LLM_COST_BILLING')
    const minimumBalance = await deps.configKV.getOrThrow('LLM_MINIMUM_BALANCE')
    const parsed = safeParse(billingPolicySchema, { minimumBalance, costPricing })
    if (!parsed.success)
      throw createServiceUnavailableError('LLM pricing configuration is incomplete', 'LLM_BILLING_UNAVAILABLE')
    const flux = await deps.fluxService.getFlux(userId)
    if (flux.flux < parsed.output.minimumBalance)
      throw createPaymentRequiredError('Insufficient flux')
    return parsed.output
  }

  function authorizeDispatch(policy: ChatBillingPolicy, route: { gateway: string, model: string }): void {
    const adapter = resolveProviderCostAdapter(route.gateway)
    if (!adapter || !Object.hasOwn(policy.costPricing, adapter.provider))
      throw createServiceUnavailableError('LLM cost adapter or price is missing', 'LLM_BILLING_UNAVAILABLE')
  }

  function priceChatUsage(usage: UsageInfo, policy: ChatBillingPolicy, provider: string): ChatUsagePrice {
    const adapter = resolveProviderCostAdapter(provider)
    if (!adapter || !Object.hasOwn(policy.costPricing, adapter.provider))
      throw createServiceUnavailableError('LLM cost adapter or price is missing', 'LLM_BILLING_UNAVAILABLE')
    const pricing = policy.costPricing[adapter.provider]
    const costUsage = adapter.extractUsage(usage)
    const charge = priceLlmCost(costUsage, pricing)
    const amount = charge.microFlux === undefined ? 0 : charge.microFlux / 1_000_000
    return { amount, costReceipt: { provider: adapter.provider, usage: costUsage, pricing } }
  }

  async function settleChat(input: Omit<ChatFluxDebitInput, 'billingService' | 'revenue'>): Promise<number> {
    return debitChatFlux({
      ...input,
      billingService: deps.billingService,
      revenue: deps.revenue,
    })
  }

  function recordChatDebitFailure(input: {
    amount: number
    model: string
    stage: 'streaming' | 'non_streaming'
  }): void {
    deps.revenue?.fluxUnbilled.add(input.amount, {
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      reason: 'debit_failed',
      stage: input.stage,
    })
  }

  async function authorizeTts(userId: string, inputText: string): Promise<TtsBillingAuthorization> {
    const flux = await deps.fluxService.getFlux(userId)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    // Pre-flight: refuse before hitting upstream if this segment would push the
    // user past their balance. Cheap-path requests below the Flux threshold
    // still pass when the user has at least 1 Flux.
    await deps.ttsMeter.assertCanAfford(userId, inputText.length, flux.flux)
    return { balance: flux.flux, inputChars: inputText.length }
  }

  async function settleTts(input: {
    userId: string
    inputText: string
    currentBalance: number
    requestId: string
    model: string
  }) {
    return deps.ttsMeter.accumulate({
      userId: input.userId,
      units: input.inputText.length,
      currentBalance: input.currentBalance,
      requestId: input.requestId,
      metadata: { model: input.model },
    })
  }

  return { authorizeChat, authorizeDispatch, authorizeTts, priceChatUsage, recordChatDebitFailure, settleChat, settleTts }
}

export async function debitChatFlux(input: ChatFluxDebitInput): Promise<number> {
  const result = await input.billingService.settleLlmCost({
    provider: input.costReceipt.provider,
    userId: input.userId,
    requestId: input.requestId,
    model: input.model,
    usage: input.costReceipt.usage,
    pricing: input.costReceipt.pricing,
    pendingReason: input.pendingReason,
    observation: input.observation,
  })

  if (result.charged < result.requested) {
    input.revenue?.fluxUnbilled.add(result.requested - result.charged, {
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      reason: 'partial_debit_drained',
      stage: input.stage,
    })
    input.logger.withFields({
      userId: input.userId,
      requestId: input.requestId,
      requested: result.requested,
      charged: result.charged,
      unbilled: result.requested - result.charged,
    }).warn(input.stage === 'streaming'
      ? 'Partial debit after streaming — flux drained to zero'
      : 'Partial debit on non-streaming completion — flux drained to zero')
  }

  return result.charged
}
