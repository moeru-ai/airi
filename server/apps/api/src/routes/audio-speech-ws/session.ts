import type { WSContext } from 'hono/ws'
import type { RawData } from 'ws'

import type { StepfunStreamingTtsUpstream, UnspeechUpstream } from '../../services/adapters/config-kv'
import type { FluxService } from '../../services/domain/flux'
import type { AudioSpeechWsHandlersOptions } from './types'

import { Buffer } from 'node:buffer'

import WebSocket from 'ws'

import { useLogger } from '@guiiai/logg'
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api'
import { ofetch } from 'ofetch'

import { fluxBalanceBucket } from '../../services/domain/flux-balance'
import { ApiError } from '../../utils/error'
import { nanoid } from '../../utils/id'
import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID,
  AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  GEN_AI_ATTR_REQUEST_MODEL,
} from '../../utils/observability'
import { bufferToString, readUsageChars, toBufferLike } from './protocol'

const log = useLogger('audio-speech-ws').useGlobalConfig()

/**
 * Conservative pre-flight estimate: assume the worst-case streaming session
 * synthesises ~2k input chars before billing materialises. Users below this
 * affordability threshold are refused before the upstream ws is dialed —
 * mirrors the pre-flight pattern at /audio/speech (handleTTS).
 */
const STREAMING_PREFLIGHT_CHARS_ESTIMATE = 2000

const STREAM_MODEL_LABEL_FALLBACK = 'streaming-tts'
const STEPFUN_STREAMING_TTS_AAD_MODEL_NAME = 'stepfun-streaming-tts'

const tracer = trace.getTracer('audio-speech-ws')

/**
 * Mutable state for one streaming speech websocket connection.
 */
export interface AudioSpeechSessionState {
  /** Stores the accepted client websocket. */
  attachClient: (ws: WSContext) => void
  /** Reads config, checks balance, decrypts the upstream key, and dials upstream after the start frame is accepted. */
  dialUpstream: () => Promise<void>
  /** Forwards a client frame or queues it while the upstream connection opens. */
  handleClientMessage: (message: { data: unknown }, ws: WSContext) => void
  /** Cancels upstream and finalizes the span when the client disconnects. */
  handleClientClose: () => void
}

export type StreamingTtsTrigger = 'auto' | 'manual'
export type StreamingTtsSource = 'audio.speech.ws' | 'chat_auto_tts' | 'manual_preview' | 'settings_test'
export type StreamingTtsVoiceType = 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'

export interface AudioSpeechSessionAnalytics {
  trigger?: StreamingTtsTrigger
  source?: StreamingTtsSource
  voiceType?: StreamingTtsVoiceType
}

/**
 * Creates the per-connection streaming speech state machine.
 *
 * Use when:
 * - A Hono websocket connection has been accepted for a verified user.
 * - Client frames must be proxied to unSpeech while billing and request logs
 *   are handled at session end.
 *
 * Expects:
 * - `UNSPEECH_UPSTREAM.streaming` has a base URL and at least one encrypted key.
 *
 * Returns:
 * - A connection-scoped state object with no global peer registry.
 */
export function createSessionState(
  userId: string,
  opts: AudioSpeechWsHandlersOptions,
  analyticsInput: AudioSpeechSessionAnalytics = {},
): AudioSpeechSessionState {
  const requestId = nanoid()
  const startedAt = Date.now()
  const analytics = normalizeAnalytics(analyticsInput)
  const span = tracer.startSpan('llm.gateway.tts.stream', {
    attributes: {
      [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech_stream',
    },
  })

  let clientWs: WSContext | null = null
  let upstreamWs: WebSocket | null = null
  let upstreamReady = false
  let closed = false
  let billed = false
  let startFrameAccepted = false
  let startValidationStarted = false
  let dialStarted = false
  let totalInputChars = 0
  let preflightFluxBalance: number | undefined
  let modelLabel = STREAM_MODEL_LABEL_FALLBACK
  let voiceLabel: string | undefined
  let startFrame: StreamingTtsStartFrame | null = null
  let provider: StreamingProvider | null = null
  let stepfunSessionId: string | null = null
  let stepfunSessionCreated = false
  /**
   * Frames the client sent before the upstream finished dialing. Buffered to
   * avoid silently dropping the `start` frame; flushed in arrival order once
   * the upstream ws transitions to OPEN.
   */
  const pendingClientFrames: Array<{ data: Buffer | string, isBinary: boolean }> = []

  function attachClient(ws: WSContext) {
    clientWs = ws
  }

  async function dialUpstream() {
    if (dialStarted)
      return
    dialStarted = true

    void opts.productEventService.track({
      userId,
      feature: 'tts',
      action: 'speech_requested',
      status: 'started',
      source: analytics.source,
      model: modelLabel,
      metadata: {
        trigger: analytics.trigger,
        ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
      },
    })

    if (!provider) {
      closeWithError(1008, 'streaming_tts_not_configured')
      return
    }

    // Pre-flight balance check: refuse before dialing if the user cannot
    // afford the worst-case session.
    try {
      const flux = await opts.fluxService.getFlux(userId)
      preflightFluxBalance = flux.flux
      await opts.ttsMeter.assertCanAfford(userId, STREAMING_PREFLIGHT_CHARS_ESTIMATE, flux.flux)
    }
    catch (err) {
      log.withError(err).withFields({ userId }).warn('pre-flight rejected streaming tts')
      // assertCanAfford throws PaymentRequiredError (402) — translate to ws
      // policy-violation close. The client can read the close code/reason to
      // surface a 'top up' prompt.
      if (isPaymentRequiredError(err))
        closeWithBlockedPreflight(1008, 'insufficient_flux')
      else
        closeWithError(1011, 'flux_preflight_failed')
      return
    }

    // Decrypt the first key. Streaming surface does not do per-attempt key
    // rotation: a live ws cannot transparently switch upstream mid-session
    // without breaking audio continuity. Fallback policy belongs at the
    // session-retry layer (next client connect), not inline.
    const entry = provider.keys[0]
    let keyPlaintext: Buffer
    try {
      keyPlaintext = opts.envelopeCrypto.decryptKey(entry.ciphertext, {
        modelName: provider.aadModelName,
        keyEntryId: entry.id,
      })
    }
    catch (err) {
      log.withError(err).withFields({ keyEntryId: entry.id }).error('decrypt failed for streaming tts key')
      closeWithError(1011, 'decrypt_failed')
      return
    }

    const upstreamURL = provider.baseURL
    span.setAttribute(AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL, upstreamURL)
    span.setAttribute(AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID, entry.id)

    let upstream: WebSocket
    try {
      upstream = new WebSocket(upstreamURL, {
        headers: {
          Authorization: `Bearer ${keyPlaintext.toString('utf8')}`,
        },
      })
    }
    finally {
      // Wipe plaintext immediately — the ws lib has already serialized the
      // header into its outgoing handshake buffer.
      keyPlaintext.fill(0)
    }

    upstreamWs = upstream

    upstream.on('open', () => {
      upstreamReady = true
      if (provider?.kind === 'stepfun')
        return
      // Flush anything the client sent during dial.
      for (const frame of pendingClientFrames) {
        try {
          upstream.send(frame.data, { binary: frame.isBinary })
        }
        catch (err) {
          log.withError(err).warn('failed to flush queued client frame')
        }
      }
      pendingClientFrames.length = 0
    })

    upstream.on('message', (data, isBinary) => {
      handleUpstreamMessage(data, isBinary)
    })

    upstream.on('close', (code, reason) => {
      log.withFields({ userId, code, reason: reason?.toString() }).debug('upstream ws closed')
      settleStepfunSession('upstream_closed')
    })

    upstream.on('error', (err) => {
      log.withError(err).withFields({ userId }).warn('upstream ws error')
      span.recordException(err)
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
      void opts.productEventService.track({
        userId,
        feature: 'tts',
        action: 'speech_failed',
        status: 'failed',
        source: analytics.source,
        model: modelLabel,
        reason: 'upstream_error',
        metadata: {
          duration_ms: Date.now() - startedAt,
          trigger: analytics.trigger,
          ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
        },
      })
      try {
        clientWs?.send(JSON.stringify({
          event: 'error',
          code: 'upstream_error',
          message: err.message,
        }))
      }
      catch {}
      settleStepfunSession('upstream_error')
    })
  }

  function handleClientMessage(message: { data: unknown }, ws: WSContext) {
    if (closed)
      return

    const isBinary = !(typeof message.data === 'string')
    const payload: Buffer | string = typeof message.data === 'string'
      ? message.data
      : message.data instanceof Buffer
        ? message.data
        : message.data instanceof ArrayBuffer
          ? Buffer.from(message.data)
          : Buffer.from(message.data as ArrayBufferLike)

    if (!startValidationStarted) {
      if (isBinary || typeof payload !== 'string') {
        closeWithError(1008, 'invalid_start_frame')
        return
      }

      const parsedStartFrame = parseStartFrame(payload)
      if (!parsedStartFrame) {
        closeWithError(1008, 'invalid_start_frame')
        return
      }

      startValidationStarted = true
      modelLabel = parsedStartFrame.model
      voiceLabel = parsedStartFrame.voice
      startFrame = parsedStartFrame
      pendingClientFrames.push({ data: payload, isBinary })
      void validateStartFrame(parsedStartFrame).then((resolvedProvider) => {
        if (!resolvedProvider || closed)
          return
        provider = resolvedProvider
        startFrameAccepted = true
        void dialUpstream()
      }).catch((err) => {
        log.withError(err).error('streaming tts start validation failed unexpectedly')
        closeWithError(1011, 'streaming_tts_start_validation_failed')
      })
      return
    }

    // Sniff input chars from text frames so billing has a fallback when
    // upstream usage.text_words is absent. Only the `text` event contributes;
    // start/finish/cancel do not.
    if (!isBinary && typeof payload === 'string') {
      maybeAccountInputChars(payload)
    }

    if (!startFrameAccepted && !dialStarted) {
      pendingClientFrames.push({ data: payload, isBinary })
      return
    }

    if (!upstreamWs || !upstreamReady) {
      pendingClientFrames.push({ data: payload, isBinary })
      return
    }

    if (provider?.kind === 'stepfun' && !stepfunSessionCreated) {
      pendingClientFrames.push({ data: payload, isBinary })
      return
    }

    try {
      if (provider?.kind === 'stepfun') {
        for (const frame of stepfunClientFrames(payload, isBinary, stepfunSessionId))
          upstreamWs.send(frame)
      }
      else {
        upstreamWs.send(payload, { binary: isBinary })
      }
    }
    catch (err) {
      log.withError(err).warn('failed to forward client frame to upstream')
      try {
        ws.close(1011, 'upstream_send_failed')
      }
      catch {}
    }
  }

  function handleClientClose() {
    if (closed)
      return
    // Client dropped — best-effort cancel upstream so the upstream session
    // releases its resources. We do not wait for SessionCanceled ack.
    if (upstreamWs && upstreamReady && provider?.kind === 'unspeech') {
      try {
        upstreamWs.send(JSON.stringify({ event: 'cancel' }))
      }
      catch {}
    }
    settleStepfunSession('client_disconnected')
  }

  function handleUpstreamMessage(data: RawData, isBinary: boolean) {
    if (provider?.kind === 'stepfun') {
      handleStepfunMessage(data, isBinary)
      return
    }
    if (!clientWs)
      return
    if (isBinary) {
      // Audio binary frames pass through verbatim.
      try {
        clientWs.send(toBufferLike(data))
      }
      catch (err) {
        log.withError(err).warn('failed to forward upstream audio to client')
      }
      return
    }

    // Control frame: forward to client AND inspect for usage / model labels.
    const text = bufferToString(data)
    try {
      clientWs.send(text)
    }
    catch (err) {
      log.withError(err).warn('failed to forward upstream control frame to client')
    }

    try {
      const evt = JSON.parse(text) as { event?: string, payload?: Record<string, unknown> }
      handleUpstreamControlEvent(evt)
    }
    catch {
      // unspeech only ever sends JSON on text frames per the v1 spec; a parse
      // failure here is a bug in unspeech or a wire corruption. Don't kill
      // the session over it — the client gets the raw frame regardless.
    }
  }

  function handleUpstreamControlEvent(evt: { event?: string, payload?: Record<string, unknown> }) {
    switch (evt.event) {
      case 'session.finished': {
        // Pull authoritative usage from upstream when present. Falls back to
        // the client-text-frame estimate accumulated in handleClientMessage.
        const usageChars = readUsageChars(evt.payload)
        const billUnits = usageChars ?? totalInputChars
        if (billUnits > 0)
          void billSession(billUnits, 'session.finished')
        else
          finalize()
        break
      }
      case 'error': {
        const code = typeof evt.payload?.code === 'string' ? evt.payload.code : 'upstream_error'
        log.withFields({ userId, code, message: String(evt.payload?.message ?? '') }).warn('upstream sent error event')
        span.setStatus({ code: SpanStatusCode.ERROR, message: code })
        break
      }
      // session.started / sentence.* / subtitle — no server-side action, pure
      // pass-through to client.
    }
  }

  /**
   * Translates StepFun's JSON/Base64 websocket events into AIRI's established
   * streaming wire protocol so the browser can keep consuming binary audio
   * and `sentence.*` / `session.finished` control frames unchanged.
   */
  function handleStepfunMessage(data: RawData, isBinary: boolean) {
    if (!clientWs || !upstreamWs || !provider || provider.kind !== 'stepfun')
      return
    if (isBinary) {
      log.warn('StepFun streaming TTS unexpectedly sent a binary frame')
      return
    }

    let event: StepfunServerEvent
    try {
      event = JSON.parse(bufferToString(data)) as StepfunServerEvent
    }
    catch {
      log.warn('StepFun streaming TTS sent a malformed JSON frame')
      return
    }

    switch (event.type) {
      case 'tts.connection.done': {
        const sessionId = event.data?.session_id
        if (!sessionId || !startFrame) {
          closeWithError(1011, 'stepfun_invalid_connection_event')
          return
        }
        stepfunSessionId = sessionId
        upstreamWs.send(JSON.stringify(stepfunCreateFrame(sessionId, startFrame, provider.instruction)))
        break
      }
      case 'tts.response.created': {
        if (!stepfunSessionId || event.data?.session_id !== stepfunSessionId)
          return
        stepfunSessionCreated = true
        clientWs.send(JSON.stringify({ event: 'session.started' }))
        const frames = pendingClientFrames.splice(0)
        for (const frame of frames) {
          for (const translated of stepfunClientFrames(frame.data, frame.isBinary, stepfunSessionId))
            upstreamWs.send(translated)
        }
        break
      }
      case 'tts.response.sentence.start':
        forwardStepfunControl('sentence.start', event.data)
        break
      case 'tts.response.sentence.end':
        forwardStepfunControl('sentence.end', event.data)
        break
      case 'tts.response.subtitle':
        forwardStepfunControl('subtitle', event.data)
        break
      case 'tts.response.audio.delta': {
        const audio = event.data?.audio
        if (typeof audio !== 'string') {
          closeWithError(1011, 'stepfun_invalid_audio_event')
          return
        }
        clientWs.send(Buffer.from(audio, 'base64'))
        break
      }
      case 'tts.response.audio.done':
        clientWs.send(JSON.stringify({ event: 'session.finished' }))
        settleStepfunSession('stepfun.audio.done')
        break
      case 'tts.response.error': {
        const code = event.data?.code ?? 'stepfun_upstream_error'
        const message = event.data?.message ?? code
        span.setStatus({ code: SpanStatusCode.ERROR, message })
        clientWs.send(JSON.stringify({ event: 'error', code, message }))
        settleStepfunSession('stepfun.response.error')
        break
      }
    }
  }

  function forwardStepfunControl(event: 'sentence.start' | 'sentence.end' | 'subtitle', payload: Record<string, unknown> | undefined) {
    try {
      clientWs?.send(JSON.stringify({ event, payload: payload ?? {} }))
    }
    catch (err) {
      log.withError(err).warn('failed to forward StepFun control frame to client')
    }
  }

  /**
   * StepFun does not report character usage on terminal events. Once text has
   * been handed to its session, bill the accepted text even when a client
   * cancels or the provider errors before `tts.response.audio.done` arrives.
   */
  function settleStepfunSession(reason: string) {
    if (provider?.kind === 'stepfun' && totalInputChars > 0) {
      void billSession(totalInputChars, reason)
      return
    }
    finalize()
  }

  function maybeAccountInputChars(rawText: string) {
    try {
      const parsed = JSON.parse(rawText) as { event?: string, text?: string }
      if (parsed.event === 'text' && typeof parsed.text === 'string') {
        totalInputChars += parsed.text.length
      }
      else if (parsed.event === 'start') {
        // Capture model label for OTel attrs / request log.
        const model = (parsed as Record<string, unknown>).model
        if (typeof model === 'string' && model.length > 0)
          modelLabel = model
        const voice = (parsed as Record<string, unknown>).voice
        if (typeof voice === 'string' && voice.length > 0)
          voiceLabel = voice
      }
    }
    catch {
      // Non-JSON text frame from client — ignore for billing, will fail
      // upstream-side anyway.
    }
  }

  async function validateStartFrame(frame: StreamingTtsStartFrame): Promise<StreamingProvider | null> {
    let stepfun: StepfunStreamingTtsUpstream | null
    let unspeech: UnspeechUpstream | null
    try {
      const [loadedStepfun, loadedUnspeech] = await Promise.all([
        opts.configKV.getOptional('STEPFUN_STREAMING_TTS_UPSTREAM'),
        opts.configKV.getOptional('UNSPEECH_UPSTREAM'),
      ])
      stepfun = (loadedStepfun as StepfunStreamingTtsUpstream | null | undefined) ?? null
      unspeech = (loadedUnspeech as UnspeechUpstream | null | undefined) ?? null
    }
    catch (err) {
      log.withError(err).error('streaming tts configuration read failed before start')
      closeWithError(1011, 'config_unavailable')
      return null
    }

    if (stepfun?.enabled) {
      if (!stepfun.models.some(model => model.id === frame.model)) {
        closeWithError(1008, 'streaming_tts_model_not_enabled')
        return null
      }
      if (!stepfun.voices.some(voice => voice.id === frame.voice)) {
        closeWithError(1008, 'streaming_tts_voice_not_enabled')
        return null
      }
      return {
        kind: 'stepfun',
        baseURL: stepfunURL(stepfun.baseURL, frame.model),
        keys: stepfun.keys,
        aadModelName: STEPFUN_STREAMING_TTS_AAD_MODEL_NAME,
        instruction: stepfun.instruction,
      }
    }

    const upstreamConfig = unspeech?.streaming
    if (!unspeech?.restBaseURL || !upstreamConfig?.baseURL || upstreamConfig.keys.length === 0) {
      closeWithError(1008, 'streaming_tts_not_configured')
      return null
    }

    const configuredModels = upstreamConfig.models ?? []
    if (!configuredModels.some((model: { id: string }) => model.id === frame.model)) {
      closeWithError(1008, 'streaming_tts_model_not_enabled')
      return null
    }

    const resourceId = streamingModelResourceId(frame.model)
    const voicesURL = streamingVoicesURL(unspeech.restBaseURL, resourceId)
    if (!voicesURL) {
      closeWithError(1011, 'streaming_tts_voice_catalog_unavailable')
      return null
    }

    let data: { voices?: unknown[] }
    try {
      data = await ofetch(voicesURL, { timeout: 5000 }) as { voices?: unknown[] }
    }
    catch (err) {
      log.withError(err).withFields({ voicesURL }).warn('streaming tts voice catalog fetch failed')
      closeWithError(1011, 'streaming_tts_voice_catalog_unavailable')
      return null
    }

    const voices = Array.isArray(data.voices) ? data.voices : []
    if (!voices.some(voice => streamingVoiceId(voice) === frame.voice)) {
      closeWithError(1008, 'streaming_tts_voice_not_enabled')
      return null
    }

    return {
      kind: 'unspeech',
      baseURL: upstreamConfig.baseURL,
      keys: upstreamConfig.keys,
      aadModelName: STREAM_MODEL_LABEL_FALLBACK,
    }
  }

  async function billSession(units: number, reason: string) {
    if (billed)
      return
    billed = true
    span.setAttribute(GEN_AI_ATTR_REQUEST_MODEL, modelLabel)

    let flux: Awaited<ReturnType<FluxService['getFlux']>>
    try {
      flux = await opts.fluxService.getFlux(userId)
    }
    catch (err) {
      log.withError(err).withFields({ userId }).warn('flux read failed at session end')
      finalize()
      return
    }

    let fluxConsumed = 0
    try {
      const result = await otelContext.with(trace.setSpan(otelContext.active(), span), () =>
        opts.ttsMeter.accumulate({
          userId,
          units,
          currentBalance: flux.flux,
          requestId,
          metadata: { model: modelLabel },
        }))
      fluxConsumed = result.fluxDebited
      span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
    }
    catch (err) {
      // Billing failure is surfaced but does not retroactively reject the
      // already-delivered audio — the user got the audio, the meter retains
      // the debt for the next request to settle (per FluxMeter rollback path).
      log.withError(err).withFields({ userId, units, reason }).error('billing accumulate failed for streaming tts')
      span.recordException(err as Error)
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'billing_failed' })
    }

    const durationMs = Date.now() - startedAt
    try {
      await opts.requestLogService.logRequest({
        userId,
        model: modelLabel,
        status: 200,
        durationMs,
        fluxConsumed,
      })
    }
    catch (err) {
      log.withError(err).warn('failed to write request log for streaming tts')
    }

    void opts.productEventService.track({
      userId,
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: analytics.source,
      model: modelLabel,
      metadata: {
        input_chars: units,
        duration_ms: durationMs,
        flux_consumed: fluxConsumed,
        trigger: analytics.trigger,
        ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
      },
    })

    finalize()
  }

  function finalize() {
    if (closed)
      return
    closed = true
    try {
      upstreamWs?.close()
    }
    catch {}
    try {
      clientWs?.close()
    }
    catch {}
    span.end()
  }

  function closeWithError(code: number, reason: string) {
    if (closed)
      return
    span.setStatus({ code: SpanStatusCode.ERROR, message: reason })
    void opts.productEventService.track({
      userId,
      feature: 'tts',
      action: 'speech_failed',
      status: 'failed',
      source: analytics.source,
      model: modelLabel,
      reason,
      metadata: {
        close_code: code,
        duration_ms: Date.now() - startedAt,
        trigger: analytics.trigger,
        ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
      },
    })
    if (clientWs) {
      try {
        clientWs.send(JSON.stringify({ event: 'error', code: reason, message: reason }))
      }
      catch {}
      try {
        clientWs.close(code, reason)
      }
      catch {}
    }
    closed = true
    span.end()
  }

  function closeWithBlockedPreflight(code: number, reason: string) {
    if (closed)
      return
    void opts.productEventService.track({
      userId,
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: analytics.source,
      model: modelLabel,
      reason: 'insufficient_balance',
      metadata: {
        block_reason: 'insufficient_balance',
        balance_state: 'insufficient',
        flux_balance_bucket: fluxBalanceBucket(preflightFluxBalance),
        billing_units: STREAMING_PREFLIGHT_CHARS_ESTIMATE,
        close_code: code,
        duration_ms: Date.now() - startedAt,
        trigger: analytics.trigger,
        ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
      },
    })
    if (clientWs) {
      try {
        clientWs.send(JSON.stringify({ event: 'error', code: reason, message: reason }))
      }
      catch {}
      try {
        clientWs.close(code, reason)
      }
      catch {}
    }
    closed = true
    span.end()
  }

  return {
    attachClient,
    dialUpstream,
    handleClientMessage,
    handleClientClose,
  }
}

function normalizeAnalytics(input: AudioSpeechSessionAnalytics): Required<AudioSpeechSessionAnalytics> {
  return {
    trigger: normalizeTrigger(input.trigger),
    source: normalizeSource(input.source),
    voiceType: normalizeVoiceType(input.voiceType),
  }
}

function normalizeTrigger(trigger: AudioSpeechSessionAnalytics['trigger']): StreamingTtsTrigger {
  return trigger === 'auto' ? 'auto' : 'manual'
}

function normalizeSource(source: AudioSpeechSessionAnalytics['source']): StreamingTtsSource {
  switch (source) {
    case 'audio.speech.ws':
    case 'chat_auto_tts':
    case 'manual_preview':
    case 'settings_test':
      return source
    default:
      return 'audio.speech.ws'
  }
}

/**
 * Normalizes streaming TTS voice type into bounded analytics values.
 */
function normalizeVoiceType(voiceType: AudioSpeechSessionAnalytics['voiceType']): StreamingTtsVoiceType {
  switch (voiceType) {
    case 'official_default':
    case 'official_selected':
    case 'custom_configured':
    case 'voice_pack':
      return voiceType
    default:
      return 'unknown'
  }
}

/**
 * Builds reusable streaming TTS voice metadata after the start frame is known.
 */
function streamingVoiceMetadata(voiceId: string | undefined, voiceType: StreamingTtsVoiceType): Record<string, unknown> {
  return {
    ...(voiceId ? { voice_id: voiceId } : {}),
    voice_type: voiceType,
  }
}

function isPaymentRequiredError(err: unknown): boolean {
  if (err instanceof ApiError)
    return err.statusCode === 402
  return typeof err === 'object'
    && err != null
    && 'statusCode' in err
    && (err as { statusCode?: unknown }).statusCode === 402
}

interface StreamingProvider {
  kind: 'unspeech' | 'stepfun'
  baseURL: string
  keys: Array<{ id: string, ciphertext: string }>
  aadModelName: string
  instruction?: string
}

interface StepfunServerEvent {
  type?: string
  data?: {
    session_id?: string
    text?: string
    audio?: string
    code?: string
    message?: string
    [key: string]: unknown
  }
}

interface StreamingTtsStartFrame {
  event: 'start'
  model: string
  voice: string
  responseFormat?: string
  extraBody?: Record<string, unknown>
}

function parseStartFrame(rawText: string): StreamingTtsStartFrame | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>
    if (parsed.event !== 'start')
      return null
    if (typeof parsed.model !== 'string' || parsed.model.length === 0)
      return null
    if (typeof parsed.voice !== 'string' || parsed.voice.length === 0)
      return null
    return {
      event: 'start',
      model: parsed.model,
      voice: parsed.voice,
      responseFormat: typeof parsed.response_format === 'string' ? parsed.response_format : undefined,
      extraBody: isRecord(parsed.extra_body) ? parsed.extra_body : undefined,
    }
  }
  catch {
    return null
  }
}

/**
 * Builds the provider websocket URL while treating the operator's configured
 * base path as authoritative: direct API and Step Plan differ only by path.
 */
function stepfunURL(baseURL: string, model: string): string {
  const url = new URL(baseURL)
  url.searchParams.set('model', streamingModelResourceId(model))
  return url.toString()
}

function stepfunCreateFrame(sessionId: string, start: StreamingTtsStartFrame, instruction: string | undefined): Record<string, unknown> {
  const extraBody = start.extraBody ?? {}
  const responseFormat = stepfunStreamingFormat(start.responseFormat)
  const sampleRate = numberFromRecord(extraBody, 'sample_rate')
    ?? numberFromRecord(isRecord(extraBody.audio) ? extraBody.audio : undefined, 'sample_rate')
  const speedRatio = numberFromRecord(extraBody, 'speed_ratio')
  const volumeRatio = numberFromRecord(extraBody, 'volume_ratio')
  const requestInstruction = stringFromRecord(extraBody, 'instruction')

  return {
    type: 'tts.create',
    data: {
      session_id: sessionId,
      voice_id: start.voice,
      response_format: responseFormat,
      text_normalization: 'standard',
      mode: 'default',
      ...(sampleRate ? { sample_rate: sampleRate } : {}),
      ...(speedRatio ? { speed_ratio: speedRatio } : {}),
      ...(volumeRatio ? { volume_ratio: volumeRatio } : {}),
      ...(requestInstruction ?? instruction ? { instruction: requestInstruction ?? instruction } : {}),
    },
  }
}

/**
 * Converts AIRI's provider-neutral client frames into StepFun commands.
 * The `start` frame is intentionally consumed by {@link stepfunCreateFrame}.
 */
function stepfunClientFrames(payload: Buffer | string, isBinary: boolean, sessionId: string | null): string[] {
  if (isBinary || !sessionId || typeof payload !== 'string')
    return []

  let frame: { event?: unknown, text?: unknown }
  try {
    frame = JSON.parse(payload) as { event?: unknown, text?: unknown }
  }
  catch {
    return []
  }

  if (frame.event === 'text' && typeof frame.text === 'string') {
    return splitStepfunText(frame.text).map(text => JSON.stringify({
      type: 'tts.text.delta',
      data: { session_id: sessionId, text },
    }))
  }
  if (frame.event === 'finish')
    return [JSON.stringify({ type: 'tts.text.done', data: { session_id: sessionId } })]
  return []
}

/**
 * AIRI concatenates audio deltas until a sentence boundary before decoding.
 * StepFun's non-streaming delta formats are independent files, so request a
 * stream variant whenever the provider offers one.
 */
function stepfunStreamingFormat(value: string | undefined): 'mp3_stream' | 'opus_stream' | 'flac_stream' {
  switch (value) {
    case 'opus':
      return 'opus_stream'
    case 'flac':
      return 'flac_stream'
    default:
      return 'mp3_stream'
  }
}

/** Splits only at Unicode code-point boundaries, as StepFun caps one delta at 1000 characters. */
function splitStepfunText(text: string): string[] {
  const characters = Array.from(text)
  const chunks: string[] = []
  for (let start = 0; start < characters.length; start += 1000)
    chunks.push(characters.slice(start, start + 1000).join(''))
  return chunks
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringFromRecord(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function streamingModelResourceId(model: string): string {
  return model.includes('/') ? model.split('/', 2)[1] : model
}

function streamingVoicesURL(restBaseURL: string, resourceId: string): string | null {
  try {
    const url = new URL(restBaseURL)
    url.pathname = '/api/voices'
    // NOTICE: The streaming websocket path is currently backed only by the
    // Volcengine Unspeech adapter. If another streaming provider is added,
    // thread provider identity through the start-frame validation path instead
    // of deriving it from the model id here.
    url.search = new URLSearchParams({ provider: 'volcengine', model: resourceId }).toString()
    return url.toString()
  }
  catch {
    return null
  }
}

function streamingVoiceId(voice: unknown): string | null {
  if (typeof voice !== 'object' || voice == null)
    return null
  const id = (voice as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}
