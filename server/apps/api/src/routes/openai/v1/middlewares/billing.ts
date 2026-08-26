import type { RevenueMetrics } from '../../../../otel'
import type { ConfigKVService } from '../../../../services/adapters/config-kv'
import type { UsageInfo } from '../../../../services/domain/billing/billing'
import type { BillingService } from '../../../../services/domain/billing/billing-service'
import type { FluxMeter } from '../../../../services/domain/billing/flux-meter'
import type { FluxService } from '../../../../services/domain/flux'

import { calculateFluxFromUsage } from '../../../../services/domain/billing/billing'
import { createPaymentRequiredError } from '../../../../utils/error'
import { GEN_AI_ATTR_REQUEST_MODEL } from '../../../../utils/observability'

export interface ChatBillingPolicy {
  fallbackRate: number
  fluxPer1kTokens?: number
}

export interface ChatFluxDebitInput extends UsageInfo {
  amount: number
  billingService: BillingService
  logger: {
    withFields: (fields: Record<string, unknown>) => {
      warn: (message: string) => void
    }
  }
  model: string
  requestId: string
  revenue?: null | RevenueMetrics
  stage: 'non_streaming' | 'streaming'
  userId: string
}

export interface OpenAiRouteBilling {
  authorizeChat: (userId: string) => Promise<ChatBillingPolicy>
  authorizeTts: (userId: string, inputText: string) => Promise<TtsBillingAuthorization>
  priceChatUsage: (usage: UsageInfo, policy: ChatBillingPolicy) => number
  recordChatDebitFailure: (input: {
    amount: number
    model: string
    stage: 'non_streaming' | 'streaming'
  }) => void
  settleChat: (input: Omit<ChatFluxDebitInput, 'billingService' | 'revenue'>) => Promise<number>
  settleTts: (input: {
    currentBalance: number
    inputText: string
    model: string
    requestId: string
    userId: string
  }) => Promise<{ fluxDebited: number }>
}

export interface TtsBillingAuthorization {
  balance: number
  inputChars: number
}

export function createOpenAiRouteBilling(deps: {
  billingService: BillingService
  configKV: ConfigKVService
  fluxService: FluxService
  revenue?: null | RevenueMetrics
  ttsMeter: FluxMeter
}): OpenAiRouteBilling {
  // NOTICE: Billing is best-effort — chat flux is debited AFTER the LLM
  // response is sent. This is a deliberate tradeoff: users get lower latency
  // and uninterrupted streaming, at the cost of a small revenue leak when
  // debit fails (e.g. DB timeout). Failed debits are logged at error level by
  // the settlement call site.
  //
  // Pre-flight gates on `balance >= fallbackRate` (not just `> 0`) because
  // streaming providers that don't echo `usage` cause every billable request
  // to fall back to `FLUX_PER_REQUEST`. Without this gate, a user sitting on
  // `0 < balance < fallbackRate` could spawn N parallel requests that each
  // pass the loose `>0` check, complete the stream, and race on the debit.
  async function authorizeChat(userId: string): Promise<ChatBillingPolicy> {
    const fallbackRate = await deps.configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = await deps.configKV.get('FLUX_PER_1K_TOKENS')

    const flux = await deps.fluxService.getFlux(userId)
    if (flux.flux < fallbackRate) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    return { fallbackRate, fluxPer1kTokens }
  }

  function priceChatUsage(usage: UsageInfo, policy: ChatBillingPolicy): number {
    if (policy.fluxPer1kTokens == null)
      return policy.fallbackRate
    return calculateFluxFromUsage(usage, policy.fluxPer1kTokens, policy.fallbackRate)
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
    stage: 'non_streaming' | 'streaming'
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
    currentBalance: number
    inputText: string
    model: string
    requestId: string
    userId: string
  }) {
    return deps.ttsMeter.accumulate({
      currentBalance: input.currentBalance,
      metadata: { model: input.model },
      requestId: input.requestId,
      units: input.inputText.length,
      userId: input.userId,
    })
  }

  return { authorizeChat, authorizeTts, priceChatUsage, recordChatDebitFailure, settleChat, settleTts }
}

export async function debitChatFlux(input: ChatFluxDebitInput): Promise<number> {
  const result = await input.billingService.consumeFluxForLLM({
    amount: input.amount,
    completionTokens: input.completionTokens,
    description: 'llm_request',
    model: input.model,
    promptTokens: input.promptTokens,
    requestId: input.requestId,
    userId: input.userId,
  })

  if (result.charged < result.requested) {
    input.revenue?.fluxUnbilled.add(result.requested - result.charged, {
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      reason: 'partial_debit_drained',
      stage: input.stage,
    })
    input.logger.withFields({
      charged: result.charged,
      requested: result.requested,
      requestId: input.requestId,
      unbilled: result.requested - result.charged,
      userId: input.userId,
    }).warn(input.stage === 'streaming'
      ? 'Partial debit after streaming — flux drained to zero'
      : 'Partial debit on non-streaming completion — flux drained to zero')
  }

  return result.charged
}
