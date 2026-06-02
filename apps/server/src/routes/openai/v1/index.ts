import type { PostHog } from 'posthog-node'

import type { GenAiMetrics, RateLimitMetrics, RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxMeter } from '../../../services/domain/billing/flux-meter'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { RequestLogService } from '../../../services/domain/request-log'
import type { HonoEnv } from '../../../types/hono'
import type { LlmTracingDeps } from './types'

import { Hono } from 'hono'

import { createAudioCatalogHandlers } from './catalog'
import { createChatCompletionHandler } from './chat'
import { createV1RouteGuards } from './guards'
import { createSpeechHandler } from './speech'
import { defaultLlmTracing } from './types'

export function createV1Routes(
  fluxService: FluxService,
  billingService: BillingService,
  configKV: ConfigKVService,
  requestLogService: RequestLogService,
  ttsMeter: FluxMeter,
  llmRouter: LlmRouterService,
  genAi?: GenAiMetrics | null,
  revenue?: RevenueMetrics | null,
  rateLimitMetrics?: RateLimitMetrics | null,
  posthog?: PostHog | null,
  llmTracing: LlmTracingDeps = defaultLlmTracing,
) {
  const deps = {
    fluxService,
    billingService,
    configKV,
    requestLogService,
    ttsMeter,
    llmRouter,
    genAi,
    revenue,
    rateLimitMetrics,
    posthog,
    llmTracing,
  }
  const guards = createV1RouteGuards(deps)
  const handleCompletion = createChatCompletionHandler(deps)
  const handleTTS = createSpeechHandler(deps)
  const {
    handleListStreamingTTSModels,
    handleListStreamingVoices,
    handleListTTSModels,
    handleListVoices,
  } = createAudioCatalogHandlers(deps)

  // OpenAI-compatible surface (mounted at /api/v1/openai). Only routes that
  // mirror an actual OpenAI public endpoint belong here. Audio used to live
  // under this prefix too, but the `/audio/voices` listing endpoint isn't a
  // real OpenAI route and the streaming TTS protocol has nothing to do with
  // OpenAI — keeping them here mislabelled the surface, so audio now mounts
  // at /api/v1/audio (see `audioRoutes` below).
  const openaiRoutes = new Hono<HonoEnv>()
    .use('*', guards.authGuard)
    .post('/chat/completions', guards.completionsRateLimit, guards.chatGuard, handleCompletion)
    .post('/chat/completion', guards.completionsRateLimit, guards.chatGuard, handleCompletion)

  // AIRI audio surface (mounted at /api/v1/audio). Lives outside /openai/ so
  // the `/voices`, `/voices/streaming`, and `/models` extensions aren't
  // misread as OpenAI-compatible. `/audio/speech/ws` is registered
  // separately in app.ts because it needs the WebSocket upgrade middleware.
  const audioRoutes = new Hono<HonoEnv>()
    .use('*', guards.authGuard)
    .post('/speech', guards.ttsGuard, handleTTS)
    .get('/voices', handleListVoices)
    .get('/voices/streaming', handleListStreamingVoices)
    .get('/models', handleListTTSModels)
    .get('/models/streaming', handleListStreamingTTSModels)

  return { openaiRoutes, audioRoutes }
}
