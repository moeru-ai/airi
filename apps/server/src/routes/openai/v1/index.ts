import type { Context } from 'hono'
import type { PostHog } from 'posthog-node'

import type { GenAiMetrics, RateLimitMetrics, RevenueMetrics } from '../../../otel'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { UsageInfo } from '../../../services/domain/billing/billing'
import type { BillingService } from '../../../services/domain/billing/billing-service'
import type { FluxMeter } from '../../../services/domain/billing/flux-meter'
import type { FluxService } from '../../../services/domain/flux'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { RequestLogService } from '../../../services/domain/request-log'
import type { HonoEnv } from '../../../types/hono'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { Hono } from 'hono'

import { authGuard } from '../../../middlewares/auth'
import { configGuard } from '../../../middlewares/config-guard'
import { rateLimiter } from '../../../middlewares/rate-limit'
import { captureSafe } from '../../../services/adapters/posthog'
import { calculateFluxFromUsage, extractUsageFromBody } from '../../../services/domain/billing/billing'
import { createBadGatewayError, createBadRequestError, createPaymentRequiredError, createServiceUnavailableError } from '../../../utils/error'
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
    // Generated up-front so incoming, completion, partial-debit, debit-failure,
    // and request-log entries all carry the same correlation id. Re-used as
    // the billing requestId (both streaming and non-streaming branches) for
    // DB-level idempotency.
    const requestId = nanoid()

    // Read billing rates before pre-flight so the gate can compare against
    // the realistic per-request cost (fallback rate), not just `> 0`.
    const fallbackRate = await configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = await configKV.get('FLUX_PER_1K_TOKENS')

    const flux = await fluxService.getFlux(user.id)
    if (flux.flux < fallbackRate) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    let requestModel = body.model || 'auto'

    if (requestModel === 'auto') {
      requestModel = await configKV.getOrThrow('DEFAULT_CHAT_MODEL')
    }

    const stream = !!body.stream
    logger.withFields({
      requestId,
      userId: user.id,
      model: requestModel,
      stream,
      messageCount: Array.isArray(body.messages) ? body.messages.length : undefined,
    }).log('chat completion request')

    // Server-connection attrs come from the router (which knows the actual
    // upstream baseURL it dispatched to) — it enriches the active span with
    // its own `airi.gen_ai.gateway.*` attrs on success.
    const span = tracer.startSpan('llm.gateway.chat', {
      attributes: {
        [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        [AIRI_ATTR_GEN_AI_STREAM]: stream,
      },
    })

    const startedAt = Date.now()

    // Router throws ApiError (502/503/504/400) on full exhaustion or unknown
    // model. We do NOT catch here — global app.onError renders the ApiError
    // shape. Span is closed inside the catch so failures show up in traces.
    // NOTICE:
    // Propagate the client disconnect signal so an upstream LLM call doesn't
    // keep generating tokens (and burning paid upstream quota) after the
    // caller hangs up. Without this the streaming-cancel path records
    // fluxConsumed: 0 while real cost was incurred — a silent revenue leak.
    // Source: codex review 2026-05-15 HIGH #1.
    const clientAbort = c.req.raw.signal
    let response: Response
    try {
      response = await context.with(trace.setSpan(context.active(), span), () =>
        llmRouter.route({ modelName: requestModel, body, headers: {}, abortSignal: clientAbort }))
    }
    catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Router exhausted or unknown model' })
      span.end()
      recordMetrics({ model: requestModel, status: 502, type: 'chat', durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      throw err
    }

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      recordMetrics({ model: requestModel, status: response.status, type: 'chat', durationMs, fluxConsumed: 0 })
      // Emit server-side so funnels see real HTTP status — the client only
      // ever observes "stream closed" and cannot tell 401 / 429 / 5xx apart.
      void captureSafe(posthog ?? null, {
        distinctId: user.id,
        event: 'llm_request_failed',
        properties: {
          model: requestModel,
          http_status: response.status,
          duration_ms: durationMs,
          stream: !!body.stream,
        },
      })

      logger.withFields({ requestId, userId: user.id, model: requestModel, status: response.status, durationMs })
        .warn('chat completion delivered with upstream error status')

      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Post-billing: parse usage and charge after successful response.
    // `fallbackRate` / `fluxPer1kTokens` were hoisted to the top of this
    // function so the pre-flight gate can use them too.

    if (stream) {
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

            void captureSafe(posthog ?? null, {
              distinctId: user.id,
              event: 'llm_request_succeeded',
              properties: {
                model: requestModel,
                http_status: response.status,
                duration_ms: durationMs,
                prompt_tokens: usage.promptTokens ?? 0,
                completion_tokens: usage.completionTokens ?? 0,
                flux_consumed: actualCharged,
                stream: true,
                stream_interrupted: streamInterrupted,
              },
            })

            logger.withFields({
              requestId,
              userId: user.id,
              model: requestModel,
              status: response.status,
              durationMs,
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              fluxConsumed: actualCharged,
              stream: true,
            }).log('chat completion delivered')
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

    void captureSafe(posthog ?? null, {
      distinctId: user.id,
      event: 'llm_request_succeeded',
      properties: {
        model: requestModel,
        http_status: response.status,
        duration_ms: durationMs,
        prompt_tokens: usage.promptTokens ?? 0,
        completion_tokens: usage.completionTokens ?? 0,
        flux_consumed: result.charged,
        stream: false,
      },
    })

    logger.withFields({
      requestId,
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      fluxConsumed: result.charged,
      stream: false,
    }).log('chat completion delivered')

    return c.json(responseBody)
  }

  async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const requestId = nanoid()
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    let requestModel = body.model || 'auto'
    // NOTICE: Guard against non-string body.input — upstream would reject it
    // anyway, but billing math (.length → INCRBY) turns NaN into a Redis error.
    const inputText: string = typeof body.input === 'string' ? body.input : ''

    if (requestModel === 'auto') {
      requestModel = await configKV.getOrThrow('DEFAULT_TTS_MODEL')
    }

    logger.withFields({
      requestId,
      userId: user.id,
      model: requestModel,
      inputChars: inputText.length,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
    }).log('tts speech request')

    // Pre-flight: refuse before hitting upstream if this segment would push the
    // user past their balance. Cheap-path requests below the Flux threshold
    // still pass when the user has at least 1 Flux.
    await ttsMeter.assertCanAfford(user.id, inputText.length, flux.flux)

    // Map OpenAI-shaped /audio/speech body → adapter-neutral TtsInput. Speed
    // / response_format / extra fields stay in adapterParams for adapters that
    // care (Azure SSML rate, Volcengine audio_params, etc.).
    const ttsInput = {
      text: inputText,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      speed: typeof body.speed === 'number' ? body.speed : undefined,
      responseFormat: typeof body.response_format === 'string' ? body.response_format : undefined,
    }

    const span = tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [GEN_AI_ATTR_REQUEST_MODEL]: requestModel,
        [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
      },
    })

    const startedAt = Date.now()

    let response: Response
    try {
      response = await context.with(trace.setSpan(context.active(), span), () =>
        llmRouter.routeTts({ modelName: requestModel, input: ttsInput, abortSignal: c.req.raw.signal }))
    }
    catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'TTS router exhausted or unknown model' })
      span.end()
      recordMetrics({ model: requestModel, status: 502, type: 'tts', durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      throw err
    }

    const durationMs = Date.now() - startedAt
    span.setAttribute('http.response.status_code', response.status)

    if (!response.ok) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `Gateway ${response.status}` })
      span.end()
      recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed: 0 })
      logger.withFields({ requestId, userId: user.id, model: requestModel, status: response.status, durationMs })
        .warn('tts speech delivered with upstream error status')
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Debt-ledger billing: accumulate chars in Redis; only debit when we
    // cross a whole-Flux boundary. Sub-threshold requests cost 0 Flux at this
    // call site — the cost is realised on a later request that crosses.
    //
    // Wrapped in try/finally so a Redis blip inside `accumulate()` (or any
    // throw before `span.end()`) doesn't leak the active span. Falling-through
    // to `throw` reaches the global ApiError handler — billing failure on a
    // 200 upstream is rare but observable, and a dropped span would have
    // hidden it.
    let fluxConsumed = 0
    try {
      const result = await ttsMeter.accumulate({
        userId: user.id,
        units: inputText.length,
        currentBalance: flux.flux,
        requestId,
        metadata: { model: requestModel },
      })
      fluxConsumed = result.fluxDebited
      span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
    }
    finally {
      span.end()
    }
    recordMetrics({ model: requestModel, status: response.status, type: 'tts', durationMs, fluxConsumed })

    recordRequestLog({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
    })

    logger.withFields({
      requestId,
      userId: user.id,
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

  async function handleListVoices(c: Context<HonoEnv>) {
    // Voice catalogs are per-model. Live providers (Azure) call upstream
    // via unspeech; static providers (cosyvoice, volcengine) return their
    // bundled JSON. The Redis cache + invalidation lives one layer down
    // in the router so route-level changes don't leak into the cache
    // contract. Recommended map stays in configKV so operators can edit it
    // without a deploy.
    //
    // No implicit fallback: an empty `?model=` is a client bug (the UI is
    // expected to pass either an explicit model id or the `auto` alias) and
    // returns 400 instead of silently resolving to DEFAULT_TTS_MODEL.
    const requested = c.req.query('model')
    if (requested === undefined || requested === '')
      throw createBadRequestError('audio voices: ?model= is required (use `auto` to defer to DEFAULT_TTS_MODEL)', 'MISSING_MODEL')

    const model = requested === 'auto'
      ? await configKV.getOrThrow('DEFAULT_TTS_MODEL')
      : requested

    const voices = await llmRouter.listTtsVoices(model)
    const recommended = (await configKV.getOptional('DEFAULT_TTS_VOICES'))?.[model] ?? {}
    // Debug level: high-frequency catalog poll from UI selectors, no
    // billing / user-facing side effect — useful only when debugging
    // voice-picker drift, never as a permanent audit trail line.
    logger.withFields({ model, voiceCount: voices.length }).debug('list tts voices')
    return Response.json({ voices, recommended })
  }

  /**
   * Voice catalog for the streaming TTS provider (`/audio/speech/ws`).
   *
   * Errors propagate verbatim: missing config → 503, malformed upstream
   * URL → 502, unspeech network failure → 502, unspeech non-2xx → 502.
   * No empty-array fallback — the UI surfaces a real failure state.
   */
  async function handleListStreamingVoices(c: Context<HonoEnv>) {
    const unspeech = await configKV.getOptional('UNSPEECH_UPSTREAM')
    if (!unspeech?.streaming?.baseURL)
      throw createServiceUnavailableError('streaming tts upstream not configured', 'STREAMING_TTS_NOT_CONFIGURED')

    // Pass through the api_resource_id (e.g. `seed-tts-2.0`). unspeech
    // filters the embedded Volcengine catalogue server-side; absent model
    // means "return everything streaming-safe".
    const model = c.req.query('model')

    let voicesURL: string
    try {
      const u = new URL(unspeech.restBaseURL)
      u.pathname = '/api/voices'
      const params = new URLSearchParams({ provider: 'volcengine' })
      if (model)
        params.set('model', model)
      u.search = `?${params.toString()}`
      voicesURL = u.toString()
    }
    catch (err) {
      logger.withError(err).withFields({ restBaseURL: unspeech.restBaseURL }).warn('streaming-voices: bad UNSPEECH_UPSTREAM.restBaseURL')
      throw createBadGatewayError('UNSPEECH_UPSTREAM.restBaseURL is malformed')
    }

    let res: Response
    try {
      res = await globalThis.fetch(voicesURL, {
        signal: AbortSignal.timeout(5000),
      })
    }
    catch (err) {
      logger.withError(err).withFields({ voicesURL }).warn('streaming-voices: unspeech fetch failed')
      throw createBadGatewayError('streaming voices upstream fetch failed')
    }

    if (!res.ok) {
      const snippet = await res.text().catch(() => '')
      logger.withFields({ voicesURL, status: res.status, snippet: snippet.slice(0, 256) }).warn('streaming-voices: unspeech non-2xx')
      throw createBadGatewayError(`streaming voices upstream ${res.status}`, { lastStatusCode: res.status })
    }

    const data = await res.json() as { voices: unknown[] }
    if (!Array.isArray(data.voices))
      throw createBadGatewayError('streaming voices upstream missing voices[]')

    const recommended = model
      ? ((await configKV.getOptional('DEFAULT_TTS_VOICES'))?.[model] ?? {})
      : {}
    return Response.json({ voices: data.voices, recommended })
  }

  async function handleListTTSModels(_c: Context<HonoEnv>) {
    // Surface the concrete TTS models the operator has configured plus the
    // `auto` alias. Clients need real model ids to pass `?model=<id>` to
    // `/audio/voices`, otherwise the voice catalog endpoint can never resolve
    // anything beyond the DEFAULT_TTS_MODEL catalog — which is the bug that
    // hid the Azure voices from the UI.
    //
    // `auto` is kept on top as an explicit "use the operator default" knob
    // for clients that don't care which concrete model handles them.
    const config = await configKV.getOrThrow('LLM_ROUTER_CONFIG')
    // `LLM_ROUTER_CONFIG` is `optional()` at the schema, so its inferred type
    // tolerates `undefined`. `getOrThrow` already throws on missing entries,
    // so by this line we know `config` is present — the `?.` here is purely
    // a TS narrowing aid.
    const modelIds = Object.keys(config?.tts?.models ?? {}).sort()
    return Response.json({
      models: [
        { id: 'auto', name: 'Auto' },
        ...modelIds.map(id => ({ id, name: id })),
      ],
    })
  }

  async function handleListStreamingTTSModels(_c: Context<HonoEnv>) {
    const unspeech = await configKV.getOptional('UNSPEECH_UPSTREAM')
    const models = unspeech?.streaming?.models ?? []
    return Response.json({
      models: models.map(m => ({
        id: m.id,
        name: m.name ?? m.id,
        description: m.description,
      })),
    })
  }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet')
  const ttsGuard = configGuard(configKV, ['FLUX_PER_1K_CHARS_TTS'], 'TTS service is not available yet')

  // 60 requests per minute per user for LLM completions
  const completionsRateLimit = rateLimiter({ max: 60, windowSec: 60, metrics: rateLimitMetrics, routeLabel: 'openai.completions' })

  // OpenAI-compatible surface (mounted at /api/v1/openai). Only routes that
  // mirror an actual OpenAI public endpoint belong here. Audio used to live
  // under this prefix too, but the `/audio/voices` listing endpoint isn't a
  // real OpenAI route and the streaming TTS protocol has nothing to do with
  // OpenAI — keeping them here mislabelled the surface, so audio now mounts
  // at /api/v1/audio (see `audioRoutes` below).
  const openaiRoutes = new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', completionsRateLimit, chatGuard, handleCompletion)
    .post('/chat/completion', completionsRateLimit, chatGuard, handleCompletion)

  // AIRI audio surface (mounted at /api/v1/audio). Lives outside /openai/ so
  // the `/voices`, `/voices/streaming`, and `/models` extensions aren't
  // misread as OpenAI-compatible. `/audio/speech/ws` is registered
  // separately in app.ts because it needs the WebSocket upgrade middleware.
  const audioRoutes = new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/speech', ttsGuard, handleTTS)
    .get('/voices', handleListVoices)
    .get('/voices/streaming', handleListStreamingVoices)
    .get('/models', handleListTTSModels)
    .get('/models/streaming', handleListStreamingTTSModels)

  return { openaiRoutes, audioRoutes }
}
