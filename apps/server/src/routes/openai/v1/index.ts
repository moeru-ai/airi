import type { Context } from 'hono'
import type Redis from 'ioredis'

import type { Env } from '../../../libs/env'
import type { GenAiMetrics, RateLimitMetrics, RevenueMetrics } from '../../../otel'
import type { UsageInfo } from '../../../services/billing/billing'
import type { BillingService } from '../../../services/billing/billing-service'
import type { FluxMeter } from '../../../services/billing/flux-meter'
import type { ConfigKVService } from '../../../services/config-kv'
import type { FluxService } from '../../../services/flux'
import type { RequestLogService } from '../../../services/request-log'
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
import { getCompressed, setCompressed } from '../../../utils/redis-compressed'
import { ttsVoicesUpstreamCacheRedisKey } from '../../../utils/redis-keys'

const tracer = trace.getTracer('v1-completions')

// Upstream /audio/voices only changes when the gateway onboards a new backend
// (days-to-weeks cadence). 24h TTL cuts per-request gateway calls to ~1/day
// per model; operators can bump DEFAULT_TTS_VOICES immediately via configKV
// (that map is fetched fresh per request, not cached here) and can wipe the
// stale voice list with `DEL tts:voices:upstream:<model>` when a backend swap
// needs to show up before the TTL expires.
const TTS_VOICES_CACHE_TTL_SECONDS = 24 * 60 * 60

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

export function createV1CompletionsRoutes(
  fluxService: FluxService,
  billingService: BillingService,
  configKV: ConfigKVService,
  requestLogService: RequestLogService,
  ttsMeter: FluxMeter,
  redis: Redis,
  env: Env,
  genAi?: GenAiMetrics | null,
  revenue?: RevenueMetrics | null,
  rateLimitMetrics?: RateLimitMetrics | null,
) {
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

  function recordRequestLog(entry: { userId: string, model: string, status: number, durationMs: number, fluxConsumed: number, promptTokens?: number, completionTokens?: number }) {
    // Best-effort: a failed request log must not surface to the user — the
    // upstream LLM response has already been delivered (or is mid-stream) by
    // the time we get here. Log loss is observability-only.
    requestLogService.logRequest(entry).catch(err => logger.withError(err).warn('Failed to write llm_request_log row'))
  }

  // NOTICE: Billing is best-effort — flux is debited AFTER the LLM response is sent.
  // This is a deliberate tradeoff: users get lower latency and uninterrupted streaming,
  // at the cost of a small revenue leak when debit fails (e.g. DB timeout).
  // Failed debits are logged at error level for monitoring/alerting.
  // A pre-debit model would require holding the response until billing confirms,
  // which adds latency and complicates streaming. We accept the leak for now.
  //
  // Pre-flight gates on `balance >= fallbackRate` (not just `> 0`) because
  // streaming providers that don't echo `usage` cause every billable request
  // to fall back to `FLUX_PER_REQUEST`. Without this gate, a user sitting on
  // `0 < balance < fallbackRate` could spawn N parallel requests that each
  // pass the loose `>0` check, complete the stream, and race on the debit —
  // first wins, rest land in the partial-debit / catch path unbilled. With
  // the gate, concurrent requests are rejected before the upstream call.
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    // Read billing rates before pre-flight so the gate can compare against
    // the realistic per-request cost (fallback rate), not just `> 0`.
    const fallbackRate = await configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = await configKV.get('FLUX_PER_1K_TOKENS')

    const flux = await fluxService.getFlux(user.id)
    if (flux.flux < fallbackRate) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const baseUrl = normalizeBaseUrl(env.GATEWAY_BASE_URL)
    const serverAttributes = getServerConnectionAttributes(baseUrl)
    let requestModel = body.model || 'auto'

    if (requestModel === 'auto') {
      requestModel = env.DEFAULT_CHAT_MODEL
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

    // Post-billing: parse usage and charge after successful response.
    // `fallbackRate` / `fluxPer1kTokens` were hoisted to the top of this
    // function so the pre-flight gate can use them too.

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
      // First-chunk timestamp for gen_ai.client.first_token.duration. Latched
      // on the first byte from upstream — captures perceived "time to first
      // token" for streaming clients. NaN until the first chunk lands so
      // `Number.isFinite` gates the histogram record.
      let firstChunkAt = Number.NaN

      // Process stream in background
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              streamCompleted = true
              break
            }
            if (!Number.isFinite(firstChunkAt)) {
              firstChunkAt = Date.now()
              genAi?.firstTokenDuration.record((firstChunkAt - startedAt) / 1000, {
                [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
                [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
              })
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
          // Counter so alerts/dashboards can fire on interrupted streams; the
          // span attribute alone only shows up in trace search, not metrics.
          genAi?.streamInterrupted.add(1, {
            [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
            stage: Number.isFinite(firstChunkAt) ? 'mid_stream' : 'before_first_chunk',
          })

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
            //
            // `consumeFluxForLLM` now drains to zero on partial balance instead
            // of throwing — the catch path only fires on `balance <= 0` (post-
            // race) or real DB errors. Partial debits are signalled via the
            // returned `charged < requested` and accounted to the same
            // `fluxUnbilled` counter (different `reason` label).
            const requestId = nanoid()
            let actualCharged = 0
            try {
              const result = await billingService.consumeFluxForLLM({
                userId: user.id,
                amount: fluxConsumed,
                requestId,
                description: 'llm_request',
                model: requestModel,
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
              })
              actualCharged = result.charged
              if (result.charged < result.requested) {
                revenue?.fluxUnbilled.add(result.requested - result.charged, {
                  [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
                  reason: 'partial_debit_drained',
                  stage: 'streaming',
                })
                logger.withFields({
                  userId: user.id,
                  requestId,
                  requested: result.requested,
                  charged: result.charged,
                  unbilled: result.requested - result.charged,
                }).warn('Partial debit after streaming — flux drained to zero')
              }
            }
            catch (err) {
              // Real revenue leak: streaming response already sent (HTTP 200,
              // tokens delivered), so this catch produces no 5xx and no DB
              // latency spike on the request path. Without a dedicated counter,
              // the failure is silent. Page on any sustained `increase()`.
              revenue?.fluxUnbilled.add(fluxConsumed, {
                [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
                reason: 'debit_failed',
                stage: 'streaming',
              })
              logger.withError(err).withFields({ userId: user.id, fluxConsumed, requestId }).error('Failed to debit flux after streaming — unpaid usage')
            }

            recordRequestLog({
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

    // Debit flux via DB transaction (source of truth).
    // The upstream call has already happened (cost incurred), so partial
    // debit + `fluxUnbilled` is the only sane recovery — same shape as the
    // streaming path. `balance <= 0` still throws and bubbles up as 402.
    const requestId = nanoid()
    const result = await billingService.consumeFluxForLLM({
      userId: user.id,
      amount: fluxConsumed,
      requestId,
      description: 'llm_request',
      model: requestModel,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })
    if (result.charged < result.requested) {
      revenue?.fluxUnbilled.add(result.requested - result.charged, {
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        reason: 'partial_debit_drained',
        stage: 'non_streaming',
      })
      logger.withFields({
        userId: user.id,
        requestId,
        requested: result.requested,
        charged: result.charged,
        unbilled: result.requested - result.charged,
      }).warn('Partial debit on non-streaming completion — flux drained to zero')
    }

    recordRequestLog({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed: result.charged,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })

    return c.json(responseBody)
  }

  async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const baseUrl = normalizeBaseUrl(env.GATEWAY_BASE_URL)
    const serverAttributes = getServerConnectionAttributes(baseUrl)
    let requestModel = body.model || 'auto'
    // NOTICE: Guard against non-string body.input — upstream would reject it
    // anyway, but billing math (.length → INCRBY) turns NaN into a Redis error.
    const inputText: string = typeof body.input === 'string' ? body.input : ''

    if (requestModel === 'auto') {
      requestModel = env.DEFAULT_TTS_MODEL
    }

    // Pre-flight: refuse before hitting upstream if this segment would push the
    // user past their balance. Cheap-path requests below the Flux threshold
    // still pass when the user has at least 1 Flux.
    await ttsMeter.assertCanAfford(user.id, inputText.length, flux.flux)

    const span = tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
        ...serverAttributes,
      },
    })

    const startedAt = Date.now()

    const response = await context.with(trace.setSpan(context.active(), span), () =>
      fetch(`${baseUrl}audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model: requestModel }),
      }))

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed: 0 })
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Debt-ledger billing: accumulate chars in Redis; only debit when we
    // cross a whole-Flux boundary. Sub-threshold requests cost 0 Flux at this
    // call site — the cost is realised on a later request that crosses.
    const { fluxDebited: fluxConsumed } = await ttsMeter.accumulate({
      userId: user.id,
      units: inputText.length,
      currentBalance: flux.flux,
      requestId: nanoid(),
      metadata: { model: requestModel },
    })

    span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
    span.end()
    recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed })

    recordRequestLog({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
    })

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  async function handleListVoices(c: Context<HonoEnv>) {
    // Voice catalogs are per-model (different TTS models expose different
    // voices), so cache key and upstream query are both keyed by model.
    // `auto` and missing values fall back to the server's default.
    const requested = c.req.query('model')
    const model = (!requested || requested === 'auto') ? env.DEFAULT_TTS_MODEL : requested
    const cacheKey = ttsVoicesUpstreamCacheRedisKey(model)

    let body: Record<string, unknown>
    const cached = await getCompressed(redis, cacheKey)
    if (cached != null) {
      body = JSON.parse(cached) as Record<string, unknown>
    }
    else {
      const url = new URL(`${normalizeBaseUrl(env.GATEWAY_BASE_URL)}audio/voices`)
      url.searchParams.set('model', model)
      const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      if (!response.ok) {
        return new Response(response.body, {
          status: response.status,
          headers: buildSafeResponseHeaders(response),
        })
      }
      // Cache the raw upstream bytes so the write path skips a parse→stringify
      // round-trip. Body is parsed below for merging with `recommended`.
      const text = await response.text()
      body = JSON.parse(text) as Record<string, unknown>
      await setCompressed(redis, cacheKey, text, TTS_VOICES_CACHE_TTL_SECONDS)
    }

    // Recommended map is read fresh from configKV (Redis-backed) so operator
    // edits take effect immediately even while the upstream list is cached.
    const recommended = (await configKV.getOptional('DEFAULT_TTS_VOICES')) ?? {}
    return Response.json({ ...body, recommended })
  }

  async function handleListTTSModels(_c: Context<HonoEnv>) {
    // Mirror the chat provider: expose a single 'auto' routing alias instead
    // of the concrete DEFAULT_TTS_MODEL id. Keeps clients insulated from
    // backend model swaps and stays symmetric with /chat listModels.
    // /audio/speech and /audio/voices already translate 'auto' into
    // env.DEFAULT_TTS_MODEL before hitting upstream.
    return Response.json({
      models: [{ id: 'auto', name: 'Auto' }],
    })
  }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet')
  const ttsGuard = configGuard(configKV, ['FLUX_PER_1K_CHARS_TTS'], 'TTS service is not available yet')

  // 60 requests per minute per user for LLM completions
  const completionsRateLimit = rateLimiter({ max: 60, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'openai.completions' })

  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', completionsRateLimit, chatGuard, handleCompletion)
    .post('/chat/completion', completionsRateLimit, chatGuard, handleCompletion)
    .post('/audio/speech', ttsGuard, handleTTS)
    .get('/audio/voices', handleListVoices)
    .get('/audio/models', handleListTTSModels)
}
