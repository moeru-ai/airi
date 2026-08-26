import type { GenAiMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { FluxMeter } from '../billing/flux-meter'
import type { FluxService } from '../flux'
import type { LlmRouterService } from '../llm-router'
import type { startTtsGeneration, TtsGenerationTrace } from '../llm-tracing'
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

const tracer = trace.getTracer('v1-completions')

const SAFE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-length',
  'content-type',
  'transfer-encoding',
])

export interface OpenAiSpeechRequest {
  abortSignal?: AbortSignal
  body: Record<string, unknown>
  sessionId?: string
  userId: string
}

export interface OpenAiSpeechServiceDeps {
  configKV: ConfigKVService
  fluxService: FluxService
  genAi?: GenAiMetrics | null
  llmRouter: LlmRouterService
  llmTracing: {
    startTtsGeneration: (input: Parameters<typeof startTtsGeneration>[0]) => TtsGenerationTrace
  }
  providerCatalogService: ProviderCatalogService
  requestLogService: RequestLogService
  ttsMeter: FluxMeter
  voicePackService: VoicePackService
}

interface TtsAnalyticsContext {
  source: 'audio.speech' | 'chat_auto_tts' | 'manual_preview' | 'settings_test'
  trigger: TtsTrigger
}

type TtsTrigger = 'auto' | 'manual'

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

    const billingUnits = Math.ceil(inputText.length * voicePackRequest.costMultiplier)

    logger.withFields({
      inputChars: inputText.length,
      model: requestModel,
      requestId,
      userId: input.userId,
      voice: requestVoice,
    }).log('tts speech request')

    const flux = await deps.fluxService.getFlux(input.userId)
    try {
      await deps.ttsMeter.assertCanAfford(input.userId, billingUnits, flux.flux)
    }
    catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 402)
        throw err

      logger.withError(err).withFields({
        model: requestModel,
        requestId,
        source: analytics.source,
        trigger: analytics.trigger,
        userId: input.userId,
      }).warn('tts speech blocked by pre-flight balance check')

      if (analytics.trigger === 'auto')
        return new Response(null, { status: 204 })

      throw createPaymentRequiredError('Insufficient flux')
    }

    const ttsInput = {
      extraOptions: voicePackRequest.extraOptions,
      responseFormat: typeof input.body.response_format === 'string' ? input.body.response_format : undefined,
      speed: voicePackRequest.speed ?? (typeof input.body.speed === 'number' ? input.body.speed : undefined),
      text: inputText,
      voice: routedVoice,
    }

    const generationTrace = deps.llmTracing.startTtsGeneration({
      input: ttsInput,
      model: requestModel,
      requestId,
      sessionId: input.sessionId,
      userId: input.userId,
    })

    const span = tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
      },
    })

    const startedAt = Date.now()
    const routeCtx = { lastStatus: null, provider: 'unknown', triedKeys: 0, triedUpstreams: 0 }
    let response: Response
    try {
      response = await context.with(trace.setSpan(context.active(), span), () =>
        deps.llmRouter.routeTts({
          abortSignal: input.abortSignal,
          input: ttsInput,
          modelName: requestModel,
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
      throw err
    }

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      generationTrace.fail(`Gateway ${response.status}`)
      recordMetrics({ durationMs, fluxConsumed: 0, model: requestModel, provider: routeCtx.provider, status: response.status })
      logger.withFields({ durationMs, model: requestModel, requestId, status: response.status, userId: input.userId })
        .warn('tts speech delivered with upstream error status')
      return new Response(response.body, {
        headers: buildSafeResponseHeaders(response),
        status: response.status,
      })
    }

    let fluxConsumed = 0
    try {
      const result = await deps.ttsMeter.accumulate({
        currentBalance: flux.flux,
        metadata: { costMultiplier: voicePackRequest.costMultiplier, model: requestModel },
        requestId,
        units: billingUnits,
        userId: input.userId,
      })
      fluxConsumed = result.fluxDebited
      span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
      generationTrace.succeed({
        fluxConsumed,
        inputChars: inputText.length,
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

    recordMetrics({ durationMs, fluxConsumed, model: requestModel, provider: routeCtx.provider, status: response.status })
    deps.requestLogService.logRequest({
      durationMs,
      fluxConsumed,
      model: requestModel,
      status: response.status,
      userId: input.userId,
    }).catch(err => logger.withError(err).warn('Failed to write llm_request_log row'))

    logger.withFields({
      durationMs,
      fluxConsumed,
      inputChars: inputText.length,
      model: requestModel,
      requestId,
      status: response.status,
      userId: input.userId,
    }).log('tts speech delivered')

    return new Response(response.body, {
      headers: buildSafeResponseHeaders(response),
      status: response.status,
    })
  }

  function recordMetrics(input: {
    durationMs: number
    fluxConsumed: number
    model: string
    provider: string
    status: number
  }): void {
    const attrs = {
      [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'tts',
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      'http.response.status_code': input.status,
      'provider': input.provider,
    }
    deps.genAi?.operationCount.add(1, attrs)
    deps.genAi?.operationDuration.record(input.durationMs / 1000, attrs)
    deps.genAi?.fluxConsumed.add(input.fluxConsumed, attrs)
  }

  return { handleSpeechRequest }
}
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value == null || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}

function readOptionalNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined
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

function routerFailure(error: unknown): { message: string, reason: string, status: number } {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      reason: error.errorCode,
      status: error.statusCode,
    }
  }

  return {
    message: 'TTS router exhausted or unknown model',
    reason: 'router_exhausted',
    status: 502,
  }
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
  return { source, trigger }
}

async function voicePackRequestOptions(
  body: Record<string, unknown>,
  context: {
    requestedModel: string
    voice?: string
    voicePackService: VoicePackService
  },
): Promise<{
  costMultiplier: number
  extraOptions: Record<string, unknown> | undefined
  model?: string
  speed?: number
  voice?: string
  voicePackId?: string
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
    costMultiplier: voicePack?.costMultiplier ?? 1,
    extraOptions: Object.keys(extraOptions).length > 0 ? extraOptions : undefined,
    model: voicePack?.ttsModelId,
    speed: voicePack?.params.rate,
    voice: voicePack?.upstreamVoiceId,
    voicePackId: voicePack?.id,
  }
}
