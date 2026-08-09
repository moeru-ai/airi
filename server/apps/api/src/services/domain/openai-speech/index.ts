import type { GenAiMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { FluxMeter } from '../billing/flux-meter'
import type { FluxService } from '../flux'
import type { LlmRouterService } from '../llm-router'
import type { startTtsGeneration, TtsGenerationTrace } from '../llm-tracing'
import type { ProductEventService } from '../product-events'
import type { ProviderCatalogService } from '../provider-catalog'
import type { RequestLogService } from '../request-log'
import type { VoicePackService } from '../voice-packs'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'

import { ApiError, createBadRequestError, createPaymentRequiredError } from '../../../utils/error'
import { nanoid } from '../../../utils/id'
import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  GEN_AI_ATTR_REQUEST_MODEL,
} from '../../../utils/observability'
import { fluxBalanceBucket } from '../flux-balance'

const tracer = trace.getTracer('v1-completions')

const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value == null || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

function readOptionalNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
}

export interface OpenAiSpeechServiceDeps {
  fluxService: FluxService
  configKV: ConfigKVService
  requestLogService: RequestLogService
  ttsMeter: FluxMeter
  llmRouter: LlmRouterService
  voicePackService: VoicePackService
  providerCatalogService: ProviderCatalogService
  productEventService: ProductEventService
  genAi?: GenAiMetrics | null
  llmTracing: {
    startTtsGeneration: (input: Parameters<typeof startTtsGeneration>[0]) => TtsGenerationTrace
  }
}

export interface OpenAiSpeechRequest {
  userId: string
  body: Record<string, unknown>
  sessionId?: string
  abortSignal?: AbortSignal
}

type TtsTrigger = 'auto' | 'manual'
type TtsVoiceType = 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'

interface TtsAnalyticsContext {
  trigger: TtsTrigger
  source: 'audio.speech' | 'chat_auto_tts' | 'manual_preview' | 'settings_test'
  voiceType: TtsVoiceType
}

/**
 * Runs the OpenAI-shaped text-to-speech gateway flow.
 *
 * Use when:
 * - The HTTP route has parsed an authenticated `/audio/speech` request and
 *   needs domain orchestration for billing, routing, tracing, and logging.
 *
 * Expects:
 * - `body` is the parsed JSON request body.
 * - Auth and route guards have already run.
 *
 * Returns:
 * - A gateway `Response` with safe upstream headers and audio body.
 */
export function createOpenAiSpeechService(deps: OpenAiSpeechServiceDeps) {
  const logger = useLogger('v1-completions').useGlobalConfig()

  async function handleSpeechRequest(input: OpenAiSpeechRequest): Promise<Response> {
    const requestId = nanoid()
    const requestedModel = typeof input.body.model === 'string' ? input.body.model : 'auto'
    let requestModel = requestedModel
    const requestVoice = typeof input.body.voice === 'string' ? input.body.voice : undefined
    const inputText = typeof input.body.input === 'string' ? input.body.input : ''
    const analytics = ttsAnalyticsContext(input.body)

    const voicePackRequest = await voicePackRequestOptions(input.body, {
      requestedModel,
      voice: requestVoice,
      voicePackService: deps.voicePackService,
    })
    requestModel = voicePackRequest.model ?? requestModel
    if (requestModel === 'auto')
      requestModel = await deps.configKV.getOrThrow('DEFAULT_TTS_MODEL')
    const routedVoice = voicePackRequest.voice ?? requestVoice
    await deps.providerCatalogService.assertTtsModelEnabled(requestModel)
    if (!voicePackRequest.voicePackId && routedVoice)
      await deps.providerCatalogService.assertTtsVoiceEnabled(requestModel, routedVoice)

    const voiceMetadata = ttsVoiceMetadata({
      voice: requestVoice,
      voicePackId: voicePackRequest.voicePackId,
      voiceType: analytics.voiceType,
    })
    const billingUnits = Math.ceil(inputText.length * voicePackRequest.costMultiplier)

    logger.withFields({
      requestId,
      userId: input.userId,
      model: requestModel,
      inputChars: inputText.length,
      voice: requestVoice,
    }).log('tts speech request')

    void deps.productEventService.track({
      userId: input.userId,
      feature: 'tts',
      action: 'speech_requested',
      status: 'started',
      source: analytics.source,
      model: requestModel,
      metadata: {
        input_chars: inputText.length,
        trigger: analytics.trigger,
        ...voiceMetadata,
      },
    })

    const flux = await deps.fluxService.getFlux(input.userId)
    try {
      await deps.ttsMeter.assertCanAfford(input.userId, billingUnits, flux.flux)
    }
    catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 402)
        throw err

      void deps.productEventService.track({
        userId: input.userId,
        feature: 'tts',
        action: 'speech_blocked',
        status: 'blocked',
        source: analytics.source,
        model: requestModel,
        reason: 'insufficient_balance',
        metadata: {
          input_chars: inputText.length,
          billing_units: billingUnits,
          block_reason: 'insufficient_balance',
          balance_state: 'insufficient',
          flux_balance_bucket: fluxBalanceBucket(flux.flux),
          trigger: analytics.trigger,
          ...voiceMetadata,
        },
      })
      logger.withError(err).withFields({
        requestId,
        userId: input.userId,
        model: requestModel,
        trigger: analytics.trigger,
        source: analytics.source,
      }).warn('tts speech blocked by pre-flight balance check')

      if (analytics.trigger === 'auto')
        return new Response(null, { status: 204 })

      throw createPaymentRequiredError('Insufficient flux')
    }

    const ttsInput = {
      text: inputText,
      voice: routedVoice,
      speed: voicePackRequest.speed ?? (typeof input.body.speed === 'number' ? input.body.speed : undefined),
      responseFormat: typeof input.body.response_format === 'string' ? input.body.response_format : undefined,
      extraOptions: voicePackRequest.extraOptions,
    }

    const generationTrace = deps.llmTracing.startTtsGeneration({
      input: ttsInput,
      model: requestModel,
      requestId,
      userId: input.userId,
      sessionId: input.sessionId,
    })

    const span = tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
      },
    })

    const startedAt = Date.now()
    const routeCtx = { provider: 'unknown', triedUpstreams: 0, triedKeys: 0, lastStatus: null }
    let response: Response
    try {
      response = await context.with(trace.setSpan(context.active(), span), () =>
        deps.llmRouter.routeTts({
          modelName: requestModel,
          input: ttsInput,
          abortSignal: input.abortSignal,
        }, routeCtx))
    }
    catch (err) {
      const failure = routerFailure(err)
      span.setStatus({ code: SpanStatusCode.ERROR, message: failure.message })
      span.end()
      generationTrace.fail(failure.message)
      recordMetrics({
        durationMs: Date.now() - startedAt,
        fluxConsumed: 0,
        model: requestModel,
        provider: routeCtx.provider,
        status: failure.status,
      })
      void deps.productEventService.track({
        userId: input.userId,
        feature: 'tts',
        action: 'speech_failed',
        status: 'failed',
        source: analytics.source,
        model: requestModel,
        provider: routeCtx.provider,
        reason: failure.reason,
        metadata: {
          http_status: failure.status,
          duration_ms: Date.now() - startedAt,
          failure_reason: failure.reason,
          trigger: analytics.trigger,
          ...voiceMetadata,
        },
      })
      throw err
    }

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      generationTrace.fail(`Gateway ${response.status}`)
      recordMetrics({ model: requestModel, status: response.status, provider: routeCtx.provider, durationMs, fluxConsumed: 0 })
      void deps.productEventService.track({
        userId: input.userId,
        feature: 'tts',
        action: 'speech_failed',
        status: 'failed',
        source: analytics.source,
        model: requestModel,
        provider: routeCtx.provider,
        reason: 'upstream_error',
        metadata: {
          http_status: response.status,
          duration_ms: durationMs,
          failure_reason: 'upstream_error',
          trigger: analytics.trigger,
          ...voiceMetadata,
        },
      })
      logger.withFields({ requestId, userId: input.userId, model: requestModel, status: response.status, durationMs })
        .warn('tts speech delivered with upstream error status')
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    let fluxConsumed = 0
    try {
      const result = await deps.ttsMeter.accumulate({
        userId: input.userId,
        units: billingUnits,
        currentBalance: flux.flux,
        requestId,
        metadata: { model: requestModel, costMultiplier: voicePackRequest.costMultiplier },
      })
      fluxConsumed = result.fluxDebited
      span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
      generationTrace.succeed({
        inputChars: inputText.length,
        fluxConsumed,
        output: { contentType: response.headers.get('content-type') },
      })
    }
    catch (err) {
      generationTrace.fail('TTS billing failed')
      throw err
    }
    finally {
      span.end()
    }

    recordMetrics({ model: requestModel, status: response.status, provider: routeCtx.provider, durationMs, fluxConsumed })
    void deps.productEventService.track({
      userId: input.userId,
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: analytics.source,
      model: requestModel,
      provider: routeCtx.provider,
      metadata: {
        http_status: response.status,
        input_chars: inputText.length,
        billing_units: billingUnits,
        cost_multiplier: voicePackRequest.costMultiplier,
        duration_ms: durationMs,
        flux_consumed: fluxConsumed,
        trigger: analytics.trigger,
        ...voiceMetadata,
      },
    })
    deps.requestLogService.logRequest({
      userId: input.userId,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
    }).catch(err => logger.withError(err).warn('Failed to write llm_request_log row'))

    logger.withFields({
      requestId,
      userId: input.userId,
      model: requestModel,
      status: response.status,
      durationMs,
      inputChars: inputText.length,
      fluxConsumed,
    }).log('tts speech delivered')

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  function recordMetrics(input: {
    model: string
    status: number
    provider: string
    durationMs: number
    fluxConsumed: number
  }): void {
    const attrs = {
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'tts',
      'http.response.status_code': input.status,
      'provider': input.provider,
    }
    deps.genAi?.operationCount.add(1, attrs)
    deps.genAi?.operationDuration.record(input.durationMs / 1000, attrs)
    deps.genAi?.fluxConsumed.add(input.fluxConsumed, attrs)
  }

  return { handleSpeechRequest }
}

function ttsAnalyticsContext(body: Record<string, unknown>): TtsAnalyticsContext {
  const extraBody = asRecord(body.extra_body)
  const analytics = asRecord(extraBody?.airi_analytics)
  const trigger = analytics?.trigger === 'auto' ? 'auto' : 'manual'
  const rawSource = analytics?.source
  const source = rawSource === 'chat_auto_tts'
    || rawSource === 'manual_preview'
    || rawSource === 'settings_test'
    ? rawSource
    : 'audio.speech'
  const voiceType = normalizeVoiceType(analytics?.voice_type)

  return { trigger, source, voiceType }
}

/**
 * Normalizes client-provided TTS voice type into bounded analytics values.
 */
function normalizeVoiceType(value: unknown): TtsVoiceType {
  switch (value) {
    case 'official_default':
    case 'official_selected':
    case 'custom_configured':
    case 'voice_pack':
      return value
    default:
      return 'unknown'
  }
}

/**
 * Builds reusable low-cardinality voice metadata for every TTS product event.
 */
function ttsVoiceMetadata(input: {
  voice?: string
  voicePackId?: string
  voiceType: TtsVoiceType
}): Record<string, unknown> {
  const voiceType = input.voicePackId ? 'voice_pack' : input.voiceType
  return {
    ...(input.voice ? { voice_id: input.voice } : {}),
    voice_type: voiceType,
    ...(input.voicePackId ? { voice_pack_id: input.voicePackId } : {}),
  }
}

async function voicePackRequestOptions(
  body: Record<string, unknown>,
  context: {
    requestedModel: string
    voice?: string
    voicePackService: VoicePackService
  },
): Promise<{
  extraOptions: Record<string, unknown> | undefined
  costMultiplier: number
  voicePackId?: string
  model?: string
  voice?: string
  speed?: number
}> {
  const extraBody = asRecord(body.extra_body)
  const voicePackOptions = asRecord(extraBody?.voice_pack)
  const pitch = readOptionalNumber(voicePackOptions, 'pitch')
  const volume = readOptionalNumber(voicePackOptions, 'volume')
  const voicePack = await resolveVoicePackRequest(voicePackOptions, context)
  const extraOptions: Record<string, unknown> = {}
  const resolvedPitch = voicePack?.params.pitch ?? pitch
  const resolvedVolume = voicePack?.params.volume ?? volume
  if (resolvedPitch != null)
    extraOptions.pitch = resolvedPitch
  if (resolvedVolume != null)
    extraOptions.volume = resolvedVolume

  return {
    extraOptions: Object.keys(extraOptions).length > 0 ? extraOptions : undefined,
    costMultiplier: voicePack?.costMultiplier ?? 1,
    voicePackId: voicePack?.id,
    model: voicePack?.ttsModelId,
    voice: voicePack?.upstreamVoiceId,
    speed: voicePack?.params.rate,
  }
}

async function resolveVoicePackRequest(
  voicePackOptions: Record<string, unknown> | undefined,
  context: {
    requestedModel: string
    voice?: string
    voicePackService: VoicePackService
  },
): Promise<Awaited<ReturnType<VoicePackService['findById']>> | null> {
  const packId = voicePackOptions?.pack_id
  const requestedVoice = context.voice?.trim()
  if (voicePackOptions?.cost_multiplier != null) {
    throw createBadRequestError('voice_pack.cost_multiplier is server-managed', 'INVALID_VOICE_PACK', {
      field: 'voice_pack.cost_multiplier',
    })
  }
  if (packId != null && (typeof packId !== 'string' || !packId.trim()))
    throw createBadRequestError('voice_pack.pack_id is required when Voice Pack billing metadata is provided', 'INVALID_VOICE_PACK')

  const pack = typeof packId === 'string'
    ? await context.voicePackService.findById(packId)
    : requestedVoice
      ? await context.voicePackService.findEnabledByVoiceId(requestedVoice)
      : null
  if (!pack && packId == null)
    return null

  if (!pack)
    throw createBadRequestError('Voice Pack not found', 'INVALID_VOICE_PACK', { packId })
  if (!pack.enabled)
    throw createBadRequestError('Voice Pack not found', 'INVALID_VOICE_PACK', { packId })

  return pack
}

function routerFailure(error: unknown): { status: number, reason: string, message: string } {
  if (error instanceof ApiError) {
    return {
      status: error.statusCode,
      reason: error.errorCode,
      message: error.message,
    }
  }

  return {
    status: 502,
    reason: 'router_exhausted',
    message: 'TTS router exhausted or unknown model',
  }
}

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}
