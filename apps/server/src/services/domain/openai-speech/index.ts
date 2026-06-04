import type { GenAiMetrics } from '../../../otel'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { FluxMeter } from '../billing/flux-meter'
import type { FluxService } from '../flux'
import type { LlmRouterService } from '../llm-router'
import type { startTtsGeneration, TtsGenerationTrace } from '../llm-tracing'
import type { ProductEventService } from '../product-events'
import type { RequestLogService } from '../request-log'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'

import { createPaymentRequiredError } from '../../../utils/error'
import { nanoid } from '../../../utils/id'
import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  GEN_AI_ATTR_REQUEST_MODEL,
} from '../../../utils/observability'

const tracer = trace.getTracer('v1-completions')

const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

export interface OpenAiSpeechServiceDeps {
  fluxService: FluxService
  configKV: ConfigKVService
  requestLogService: RequestLogService
  ttsMeter: FluxMeter
  llmRouter: LlmRouterService
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
    let requestModel = typeof input.body.model === 'string' ? input.body.model : 'auto'
    const inputText = typeof input.body.input === 'string' ? input.body.input : ''

    if (requestModel === 'auto')
      requestModel = await deps.configKV.getOrThrow('DEFAULT_TTS_MODEL')

    logger.withFields({
      requestId,
      userId: input.userId,
      model: requestModel,
      inputChars: inputText.length,
      voice: typeof input.body.voice === 'string' ? input.body.voice : undefined,
    }).log('tts speech request')

    void deps.productEventService.track({
      userId: input.userId,
      feature: 'tts',
      action: 'speech_requested',
      status: 'started',
      source: 'audio.speech',
      model: requestModel,
      metadata: {
        input_chars: inputText.length,
      },
    })

    const flux = await deps.fluxService.getFlux(input.userId)
    if (flux.flux <= 0)
      throw createPaymentRequiredError('Insufficient flux')
    await deps.ttsMeter.assertCanAfford(input.userId, inputText.length, flux.flux)

    const ttsInput = {
      text: inputText,
      voice: typeof input.body.voice === 'string' ? input.body.voice : undefined,
      speed: typeof input.body.speed === 'number' ? input.body.speed : undefined,
      responseFormat: typeof input.body.response_format === 'string' ? input.body.response_format : undefined,
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
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'TTS router exhausted or unknown model' })
      span.end()
      generationTrace.fail('TTS router exhausted or unknown model')
      recordMetrics({
        durationMs: Date.now() - startedAt,
        fluxConsumed: 0,
        model: requestModel,
        provider: routeCtx.provider,
        status: 502,
      })
      void deps.productEventService.track({
        userId: input.userId,
        feature: 'tts',
        action: 'speech_failed',
        status: 'failed',
        source: 'audio.speech',
        model: requestModel,
        provider: routeCtx.provider,
        reason: 'router_exhausted',
        metadata: {
          duration_ms: Date.now() - startedAt,
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
        source: 'audio.speech',
        model: requestModel,
        provider: routeCtx.provider,
        reason: 'upstream_error',
        metadata: {
          http_status: response.status,
          duration_ms: durationMs,
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
        units: inputText.length,
        currentBalance: flux.flux,
        requestId,
        metadata: { model: requestModel },
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
      source: 'audio.speech',
      model: requestModel,
      provider: routeCtx.provider,
      metadata: {
        http_status: response.status,
        input_chars: inputText.length,
        duration_ms: durationMs,
        flux_consumed: fluxConsumed,
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

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}
