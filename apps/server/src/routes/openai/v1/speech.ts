import type { Context, Handler } from 'hono'

import type { HonoEnv } from '../../../types/hono'
import type { V1RouteDeps } from './types'

import { useLogger } from '@guiiai/logg'

import { nanoid } from '../../../utils/id'
import { createOpenAiRouteBilling } from './billing'
import { buildSafeResponseHeaders } from './response'
import { createRouteTelemetry, newRouteContext } from './telemetry'

export function createSpeechHandler(deps: V1RouteDeps): Handler<HonoEnv> {
  const logger = useLogger('v1-completions').useGlobalConfig()
  const telemetry = createRouteTelemetry({
    genAi: deps.genAi,
    requestLogService: deps.requestLogService,
  })
  const billing = createOpenAiRouteBilling(deps)

  return async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const requestId = nanoid()

    const body = await c.req.json()
    let requestModel = body.model || 'auto'
    // NOTICE: Guard against non-string body.input — upstream would reject it
    // anyway, but billing math (.length → INCRBY) turns NaN into a Redis error.
    const inputText: string = typeof body.input === 'string' ? body.input : ''

    if (requestModel === 'auto') {
      requestModel = await deps.configKV.getOrThrow('DEFAULT_TTS_MODEL')
    }

    logger.withFields({
      requestId,
      userId: user.id,
      model: requestModel,
      inputChars: inputText.length,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
    }).log('tts speech request')

    const billingAuthorization = await billing.authorizeTts(user.id, inputText)

    // Map OpenAI-shaped /audio/speech body → adapter-neutral TtsInput. Speed
    // / response_format / extra fields stay in adapterParams for adapters that
    // care (Azure SSML rate, Volcengine audio_params, etc.).
    const ttsInput = {
      text: inputText,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      speed: typeof body.speed === 'number' ? body.speed : undefined,
      responseFormat: typeof body.response_format === 'string' ? body.response_format : undefined,
    }
    const generationTrace = deps.llmTracing.startTtsGeneration({
      input: ttsInput,
      model: requestModel,
      requestId,
      userId: user.id,
      sessionId: c.req.header('x-airi-session-id'),
    })

    const span = telemetry.startTtsSpan({ model: requestModel })

    const startedAt = Date.now()

    const routeCtx = newRouteContext()
    let response: Response
    try {
      response = await telemetry.runWithSpan(span, () =>
        deps.llmRouter.routeTts({ modelName: requestModel, input: ttsInput, abortSignal: c.req.raw.signal }, routeCtx))
    }
    catch (err) {
      telemetry.failSpan(span, 'TTS router exhausted or unknown model')
      generationTrace.fail('TTS router exhausted or unknown model')
      telemetry.recordMetrics({ model: requestModel, status: 502, type: 'tts', provider: routeCtx.provider, durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      throw err
    }

    const durationMs = Date.now() - startedAt
    telemetry.setHttpStatus(span, response.status)

    if (!response.ok) {
      telemetry.failSpan(span, `Gateway ${response.status}`)
      generationTrace.fail(`Gateway ${response.status}`)
      telemetry.recordMetrics({ model: requestModel, status: response.status, type: 'tts', provider: routeCtx.provider, durationMs, fluxConsumed: 0 })
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
      const result = await billing.settleTts({
        userId: user.id,
        inputText,
        currentBalance: billingAuthorization.balance,
        requestId,
        model: requestModel,
      })
      fluxConsumed = result.fluxDebited
      telemetry.recordTtsBillingOnSpan(span, fluxConsumed)
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
      telemetry.endSpan(span)
    }
    telemetry.recordMetrics({ model: requestModel, status: response.status, type: 'tts', provider: routeCtx.provider, durationMs, fluxConsumed })

    telemetry.recordRequestLog({
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
}
