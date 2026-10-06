import type { RevenueMetrics } from '../../../../otel'
import type { ConfigKVService } from '../../../../services/adapters/config-kv'
import type { BillingService } from '../../../../services/domain/billing/billing-service'
import type { LlmBillingService } from '../../../../services/domain/billing/llm-billing'
import type { BillingPolicy, CostPricing, CostUsage } from '../../../../services/domain/billing/llm-price'
import type { SpeechMeter } from '../../../../services/domain/billing/speech-billing'
import type { FluxService } from '../../../../services/domain/flux'
import type { UsageInfo } from '../../../../services/domain/generation-usage'
import type { SubscriptionService } from '../../../../services/domain/subscriptions'

import { safeParse } from 'valibot'

import { resolveProviderCostAdapter } from '../../../../services/adapters/llm/cost'
import { availableMicroFlux, microFluxToFlux } from '../../../../services/domain/billing/billing-service'
import { MICRO_PER_CREDIT } from '../../../../services/domain/billing/credit-posting'
import { billingPolicySchema, priceLlmCost } from '../../../../services/domain/billing/llm-price'
import { createUsageSettlement } from '../../../../services/domain/billing/settlement'
import { createPaymentRequiredError, createServiceUnavailableError } from '../../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../../utils/observability'

export interface ChatFluxDebitInput extends UsageInfo {
  llmBilling: LlmBillingService
  revenue?: RevenueMetrics | null
  userId: string
  requestId: string
  model: string
  amount: number
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

export interface OpenAiRouteBilling {
  authorizeChat: (userId: string) => Promise<ChatBillingPolicy>
  authorizeDispatch: (policy: ChatBillingPolicy, route: { gateway: string, model: string }) => void
  priceChatUsage: (usage: UsageInfo, policy: ChatBillingPolicy, provider: string) => ChatUsagePrice
  recordChatDebitFailure: (input: {
    amount: number
    model: string
    stage: 'streaming' | 'non_streaming'
  }) => void
  settleChat: (input: Omit<ChatFluxDebitInput, 'llmBilling' | 'revenue'>) => Promise<number>

}

export function createOpenAiRouteBilling(deps: {
  llmBilling: LlmBillingService
  billingService: BillingService
  subscriptions?: SubscriptionService
  configKV: ConfigKVService
  fluxService: FluxService
  revenue?: RevenueMetrics | null
  speechBilling: SpeechMeter
}): OpenAiRouteBilling {
  const usageSettlement = createUsageSettlement({
    plans: deps.subscriptions,
    walletMicro: async userId => availableMicroFlux(await deps.billingService.getWallet(userId)),
  })
  async function authorizeChat(userId: string): Promise<ChatBillingPolicy> {
    const costPricing = await deps.configKV.getOptional('LLM_COST_BILLING')
    const minimumBalance = await deps.configKV.getOrThrow('LLM_MINIMUM_BALANCE')
    const parsed = safeParse(billingPolicySchema, { minimumBalance, costPricing })
    if (!parsed.success)
      throw createServiceUnavailableError('LLM pricing configuration is incomplete', 'LLM_BILLING_UNAVAILABLE')
    await deps.fluxService.getFlux(userId)
    // One pool must cover the minimum. Plan Credits and the wallet are not added together.
    const minimumMicro = parsed.output.minimumBalance * MICRO_PER_CREDIT
    if (!await usageSettlement.canCover(userId, minimumMicro))
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
    const amount = microFluxToFlux(charge.costMicroFlux ?? 0)
    return { amount, costReceipt: { provider: adapter.provider, usage: costUsage, pricing } }
  }

  async function settleChat(input: Omit<ChatFluxDebitInput, 'llmBilling' | 'revenue'>): Promise<number> {
    // Pending and zero-fee requests stay on the wallet path.
    // llm-billing keeps the pending receipt and posts no plan debit.
    const quote = priceLlmCost(input.costReceipt.usage, input.costReceipt.pricing)
    const micro = input.pendingReason === undefined && input.amount > 0
      ? (quote.costMicroFlux ?? 0)
      : 0
    let walletFlux = 0
    const settlement = await usageSettlement.settle({
      userId: input.userId,
      requestId: input.requestId,
      micro,
      postWallet: async () => {
        const posted = await debitChatFlux({
          ...input,
          llmBilling: deps.llmBilling,
          revenue: deps.revenue,
        })
        walletFlux = posted.feeFlux
        return { replay: posted.replay }
      },
    })
    if (settlement.meter === 'unbilled') {
      deps.revenue?.fluxUnbilled.add(input.amount, {
        [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
        reason: 'plan_quota_exhausted',
        stage: input.stage,
      })
      return 0
    }
    if (settlement.meter === 'plan')
      return 0
    return walletFlux
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

  return { authorizeChat, authorizeDispatch, priceChatUsage, recordChatDebitFailure, settleChat }
}

async function debitChatFlux(input: ChatFluxDebitInput): Promise<{ feeFlux: number, replay: boolean }> {
  const result = await input.llmBilling.settleLlmCost({
    provider: input.costReceipt.provider,
    userId: input.userId,
    requestId: input.requestId,
    model: input.model,
    usage: input.costReceipt.usage,
    pricing: input.costReceipt.pricing,
    pendingReason: input.pendingReason,
  })

  if (!result.replay && result.charged < result.requested) {
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

  return { feeFlux: result.feeFlux, replay: result.replay }
}
