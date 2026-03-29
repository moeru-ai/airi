import type { Context } from 'hono'

import type { MqService } from '../../../libs/mq'
import type { GenAiMetrics } from '../../../libs/otel'
import type { UsageInfo } from '../../../services/billing/billing'
import type { BillingEvent } from '../../../services/billing/billing-events'
import type { BillingService } from '../../../services/billing/billing-service'
import type { ConfigKVService } from '../../../services/config-kv'
import type { FluxService } from '../../../services/flux'
import type { HonoEnv } from '../../../types/hono'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { Hono } from 'hono'

import { authGuard } from '../../../middlewares/auth'
import { configGuard } from '../../../middlewares/config-guard'
import { rateLimiter } from '../../../middlewares/rate-limit'
import { calculateFluxFromUsage, extractUsageFromBody } from '../../../services/billing/billing'
import { createPaymentRequiredError } from '../../../utils/error'
import { nanoid } from '../../../utils/id'
import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  AIRI_ATTR_GEN_AI_STREAM,
  AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED,
  GEN_AI_ATTR_OPERATION_NAME,
  GEN_AI_ATTR_REQUEST_MODEL,
  GEN_AI_ATTR_USAGE_INPUT_TOKENS,
  GEN_AI_ATTR_USAGE_OUTPUT_TOKENS,
  getServerConnectionAttributes,
} from '../../../utils/observability'

const tracer = trace.getTracer('v1-completions')

const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}

function normalizeBaseUrl(gatewayBaseUrl: string): string {
  return gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl : `${gatewayBaseUrl}/`
}

function getLlmMetricAttributes(opts: { model: string, type: string, status: number }): Record<string, string | number> {
  if (opts.type === 'chat') {
    return {
      [GEN_AI_ATTR_REQUEST_MODEL]: opts.model,
      [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
      'http.response.status_code': opts.status,
    }
  }

  return {
    [GEN_AI_ATTR_REQUEST_MODEL]: opts.model,
    [AIRI_ATTR_GEN_AI_OPERATION_KIND]: opts.type,
    'http.response.status_code': opts.status,
  }
}

export function createV1CompletionsRoutes(fluxService: FluxService, billingService: BillingService, configKV: ConfigKVService, billingMq: MqService<BillingEvent>, genAi?: GenAiMetrics | null) {
  const logger = useLogger('v1-completions').useGlobalConfig()
  // TODO: Extract this compat route into smaller facades/modules.
  // It currently mixes auth, rate limiting, proxying, billing, telemetry, and event publishing in one transport layer entrypoint.

  function recordMetrics(opts: { model: string, status: number, type: string, durationMs: number, fluxConsumed: number, promptTokens?: number, completionTokens?: number }) {
    if (!genAi)
      return
    const attrs = getLlmMetricAttributes(opts)
    genAi.operationCount.add(1, attrs)
    genAi.operationDuration.record(opts.durationMs / 1000, attrs)
    genAi.fluxConsumed.add(opts.fluxConsumed, attrs)
    if (opts.promptTokens != null)
      genAi.tokenUsageInput.add(opts.promptTokens, attrs)
    if (opts.completionTokens != null)
      genAi.tokenUsageOutput.add(opts.completionTokens, attrs)
  }

  function publishRequestLog(entry: { userId: string, model: string, status: number, durationMs: number, fluxConsumed: number, promptTokens?: number, completionTokens?: number }) {
    billingMq.publish({
      eventId: nanoid(),
      eventType: 'llm.request.log' as const,
      aggregateId: entry.userId,
      userId: entry.userId,
      occurredAt: new Date().toISOString(),
      schemaVersion: 1,
      payload: {
        model: entry.model,
        status: entry.status,
        durationMs: entry.durationMs,
        fluxConsumed: entry.fluxConsumed,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
      },
    }).catch(err => logger.withError(err).warn('Failed to publish request log event'))
  }

  // NOTICE: Billing is best-effort — flux is debited AFTER the LLM response is sent.
  // This is a deliberate tradeoff: users get lower latency and uninterrupted streaming,
  // at the cost of a small revenue leak when debit fails (e.g. DB timeout).
  // Failed debits are logged at error level for monitoring/alerting.
  // A pre-debit model would require holding the response until billing confirms,
  // which adds latency and complicates streaming. We accept the leak for now.
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const serverAttributes = getServerConnectionAttributes(baseUrl)
    let requestModel = body.model || 'auto'

    if (requestModel === 'auto') {
      requestModel = await configKV.getOrThrow('DEFAULT_CHAT_MODEL')
    }

    const span = tracer.startSpan('llm.gateway.chat', {
      attributes: {
        [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        [AIRI_ATTR_GEN_AI_STREAM]: !!body.stream,
        ...serverAttributes,
      },
    })

    const startedAt = Date.now()

    const response = await context.with(trace.setSpan(context.active(), span), () =>
      fetch(`${baseUrl}chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model: requestModel }),
      }))

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      recordMetrics({ model: requestModel, status: response.status, type: 'chat', durationMs, fluxConsumed: 0 })
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Post-billing: parse usage and charge after successful response
    const fallbackRate = await configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = await configKV.get('FLUX_PER_1K_TOKENS')

    if (body.stream) {
      // Streaming: return response immediately, bill after stream ends
      const { readable, writable } = new TransformStream()
      const reader = response.body!.getReader()
      const writer = writable.getWriter()
      const decoder = new TextDecoder()
      // Buffer last 2KB to handle chunk boundary splits for usage extraction
      let tailBuffer = ''
      let streamCompleted = false
      let streamInterrupted = false

      // Process stream in background
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              streamCompleted = true
              break
            }
            await writer.write(value)
            const text = decoder.decode(value, { stream: true })
            tailBuffer = (tailBuffer + text).slice(-2048)
          }
        }
        catch (err) {
          streamInterrupted = true
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Gateway stream interrupted' })
          span.setAttribute(AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED, true)

          try {
            await writer.abort(err)
          }
          catch (abortErr) {
            logger.withError(abortErr).warn('Failed to abort stream writer after upstream interruption')
          }

          logger.withError(err).warn('Upstream stream interrupted before completion')
          return
        }
        finally {
          if (streamInterrupted) {
            span.end()
            recordMetrics({ model: requestModel, status: response.status, type: 'chat', durationMs, fluxConsumed: 0 })
          }
          else if (streamCompleted) {
            try {
              await writer.close()
            }
            catch (err) {
              logger.withError(err).warn('Failed to close stream writer')
            }

            // Extract usage from final SSE data lines
            let usage: UsageInfo = {}
            try {
              const lines = tailBuffer.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
              const lastDataLine = lines.at(-1)
              if (lastDataLine) {
                const json = JSON.parse(lastDataLine.slice(6))
                usage = extractUsageFromBody(json)
              }
            }
            catch (err) { logger.withError(err).warn('Failed to extract usage from stream, falling back to flat rate') }

            const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

            span.setAttributes({
              [GEN_AI_ATTR_USAGE_INPUT_TOKENS]: usage.promptTokens ?? 0,
              [GEN_AI_ATTR_USAGE_OUTPUT_TOKENS]: usage.completionTokens ?? 0,
              [AIRI_ATTR_BILLING_FLUX_CONSUMED]: fluxConsumed,
            })
            span.end()
            recordMetrics({ model: requestModel, status: response.status, type: 'chat', durationMs, fluxConsumed, ...usage })

            // Debit flux via DB transaction (source of truth)
            // NOTICE: streaming response is already sent, so we cannot reject on failure.
            // Log at error level so unpaid usage is visible in monitoring/alerts.
            const requestId = nanoid()
            let actualCharged = 0
            try {
              await billingService.consumeFluxForLLM({
                userId: user.id,
                amount: fluxConsumed,
                requestId,
                description: 'llm_request',
                model: requestModel,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
              })
              actualCharged = fluxConsumed
            }
            catch (err) { logger.withError(err).withFields({ userId: user.id, fluxConsumed, requestId }).error('Failed to debit flux after streaming — unpaid usage') }

            publishRequestLog({
              userId: user.id,
              model: requestModel,
              status: response.status,
              durationMs,
              fluxConsumed: actualCharged,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
            })
          }
        }
      })()

      return new Response(readable, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Non-streaming: parse response, bill, then return
    const responseBody = await response.json()
    const usage = extractUsageFromBody(responseBody)
    const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

    span.setAttributes({
      [GEN_AI_ATTR_USAGE_INPUT_TOKENS]: usage.promptTokens ?? 0,
      [GEN_AI_ATTR_USAGE_OUTPUT_TOKENS]: usage.completionTokens ?? 0,
      [AIRI_ATTR_BILLING_FLUX_CONSUMED]: fluxConsumed,
    })
    span.end()
    recordMetrics({ model: requestModel, status: response.status, type: 'chat', durationMs, fluxConsumed, ...usage })

    // Debit flux via DB transaction (source of truth)
    // NOTICE: no try/catch — debit failure (e.g. insufficient balance) must block the response
    const requestId = nanoid()
    await billingService.consumeFluxForLLM({
      userId: user.id,
      amount: fluxConsumed,
      requestId,
      description: 'llm_request',
      model: requestModel,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })

    publishRequestLog({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })

    return c.json(responseBody)
  }

  // async function handleTTS(c: Context<HonoEnv>) {
  //   const user = c.get('user')!
  //   const flux = await fluxService.getFlux(user.id)
  //   if (flux.flux <= 0) {
  //     throw createPaymentRequiredError('Insufficient flux')
  //   }

  //   const body = await c.req.json()
  //   const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
  //   const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
  //   const serverAttributes = getServerConnectionAttributes(baseUrl)
  //   const requestModel = body.model || 'auto'

  //   const span = tracer.startSpan('llm.gateway.tts', {
  //     attributes: {
  //       [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
  //       [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
  //       ...serverAttributes,
  //     },
  //   })

  //   const startedAt = Date.now()

  //   const response = await context.with(trace.setSpan(context.active(), span), () =>
  //     fetch(`${baseUrl}audio/speech`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(body),
  //     }))

  //   const durationMs = Date.now() - startedAt
  //   span.setAttribute('http.response.status_code', response.status)

  //   if (!response.ok) {
  //     span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
  //     span.end()
  //     recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed: 0 })
  //     return new Response(response.body, {
  //       status: response.status,
  //       headers: buildSafeResponseHeaders(response),
  //     })
  //   }

  //   const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_TTS')
  //   await billingService.consumeFluxForLLM({
  //     userId: user.id,
  //     amount: fluxPerRequest,
  //     requestId: nanoid(),
  //     description: `tts:${requestModel}`,
  //   })

  //   span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxPerRequest)
  //   span.end()
  //   recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed: fluxPerRequest })

  //   publishRequestLog({
  //     userId: user.id,
  //     model: requestModel,
  //     status: response.status,
  //     durationMs,
  //     fluxConsumed: fluxPerRequest,
  //   })

  //   return new Response(response.body, {
  //     status: response.status,
  //     headers: buildSafeResponseHeaders(response),
  //   })
  // }

  // async function handleTranscription(c: Context<HonoEnv>) {
  //   const user = c.get('user')!
  //   const flux = await fluxService.getFlux(user.id)
  //   if (flux.flux <= 0) {
  //     throw createPaymentRequiredError('Insufficient flux')
  //   }

  //   const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
  //   const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
  //   const serverAttributes = getServerConnectionAttributes(baseUrl)

  //   const span = tracer.startSpan('llm.gateway.asr', {
  //     attributes: {
  //       [GEN_AI_ATTR_REQUEST_MODEL]: 'auto',
  //       [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'speech_to_text',
  //       ...serverAttributes,
  //     },
  //   })

  //   const startedAt = Date.now()

  //   const rawBody = await c.req.arrayBuffer()
  //   const contentType = c.req.header('content-type') || 'multipart/form-data'

  //   const response = await context.with(trace.setSpan(context.active(), span), () =>
  //     fetch(`${baseUrl}audio/transcriptions`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': contentType },
  //       body: rawBody,
  //     }))

  //   const durationMs = Date.now() - startedAt
  //   span.setAttribute('http.response.status_code', response.status)

  //   if (!response.ok) {
  //     span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
  //     span.end()
  //     recordMetrics({ model: 'auto', status: response.status, type: 'asr', durationMs, fluxConsumed: 0 })
  //     return new Response(response.body, {
  //       status: response.status,
  //       headers: buildSafeResponseHeaders(response),
  //     })
  //   }

  //   const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_ASR')
  //   await billingService.consumeFluxForLLM({
  //     userId: user.id,
  //     amount: fluxPerRequest,
  //     requestId: nanoid(),
  //     description: `asr:auto`,
  //   })

  //   span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxPerRequest)
  //   span.end()
  //   recordMetrics({ model: 'auto', status: response.status, type: 'asr', durationMs, fluxConsumed: fluxPerRequest })

  //   publishRequestLog({
  //     userId: user.id,
  //     model: 'auto',
  //     status: response.status,
  //     durationMs,
  //     fluxConsumed: fluxPerRequest,
  //   })

  //   return new Response(response.body, {
  //     status: response.status,
  //     headers: buildSafeResponseHeaders(response),
  //   })
  // }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST', 'GATEWAY_BASE_URL', 'DEFAULT_CHAT_MODEL'], 'Service is not available yet')
  // const ttsGuard = configGuard(configKV, ['FLUX_PER_REQUEST_TTS', 'GATEWAY_BASE_URL'], 'TTS service is not available yet')
  // const asrGuard = configGuard(configKV, ['FLUX_PER_REQUEST_ASR', 'GATEWAY_BASE_URL'], 'ASR service is not available yet')

  // 60 requests per minute per user for LLM completions
  const completionsRateLimit = rateLimiter({ max: 60, windowSec: 60 })

  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', completionsRateLimit, chatGuard, handleCompletion)
    .post('/chat/completion', completionsRateLimit, chatGuard, handleCompletion)
    // .post('/audio/speech', ttsGuard, handleTTS)
    // .post('/audio/transcriptions', bodyLimit({ maxSize: 25 * 1024 * 1024 }), asrGuard, handleTranscription)
}
