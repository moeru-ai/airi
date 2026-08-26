import type { GenAiMetrics, RateLimitMetrics, RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxMeter } from '../../../services/domain/billing/flux-meter'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { ChatGenerationTrace, TtsGenerationTrace } from '../../../services/domain/llm-tracing'
import type { ProductEventService } from '../../../services/domain/product-events'
import type { ProviderCatalogService } from '../../../services/domain/provider-catalog'
import type { RequestLogService } from '../../../services/domain/request-log'
import type { VoicePackService } from '../../../services/domain/voice-packs'

import { startChatGeneration, startTtsGeneration } from '../../../services/domain/llm-tracing'

export interface LlmTracingDeps {
  startChatGeneration: (input: Parameters<typeof startChatGeneration>[0]) => ChatGenerationTrace
  startTtsGeneration: (input: Parameters<typeof startTtsGeneration>[0]) => TtsGenerationTrace
}

export interface V1RouteDeps {
  fluxService: FluxService
  billingService: BillingService
  configKV: ConfigKVService
  requestLogService: RequestLogService
  productEventService: ProductEventService
  ttsMeter: FluxMeter
  llmRouter: LlmRouterService
  voicePackService: VoicePackService
  providerCatalogService: ProviderCatalogService
  genAi?: GenAiMetrics | null
  revenue?: RevenueMetrics | null
  rateLimitMetrics?: RateLimitMetrics | null
  llmTracing: LlmTracingDeps
}

export const defaultLlmTracing: LlmTracingDeps = {
  startChatGeneration,
  startTtsGeneration,
}
