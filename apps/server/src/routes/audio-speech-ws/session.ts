import type { WSContext } from 'hono/ws'
import type { RawData } from 'ws'

import type { FluxService } from '../../services/domain/flux'
import type { AudioSpeechWsHandlersOptions } from './types'

import { Buffer } from 'node:buffer'

import WebSocket from 'ws'

import { useLogger } from '@guiiai/logg'
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api'

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

const tracer = trace.getTracer('audio-speech-ws')

/**
 * Mutable state for one streaming speech websocket connection.
 */
export interface AudioSpeechSessionState {
  /** Stores the accepted client websocket. */
  attachClient: (ws: WSContext) => void
  /** Reads config, checks balance, decrypts the upstream key, and dials upstream. */
  dialUpstream: () => Promise<void>
  /** Forwards a client frame or queues it while the upstream connection opens. */
  handleClientMessage: (message: { data: unknown }, ws: WSContext) => void
  /** Cancels upstream and finalizes the span when the client disconnects. */
  handleClientClose: () => void
}

export type StreamingTtsTrigger = 'auto' | 'manual'
export type StreamingTtsSource = 'audio.speech.ws' | 'chat_auto_tts' | 'manual_preview' | 'settings_test'

export interface AudioSpeechSessionAnalytics {
  trigger?: StreamingTtsTrigger
  source?: StreamingTtsSource
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
  let totalInputChars = 0
  let modelLabel = STREAM_MODEL_LABEL_FALLBACK
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
    void opts.productEventService.track({
      userId,
      feature: 'tts',
      action: 'speech_requested',
      status: 'started',
      source: analytics.source,
      model: modelLabel,
      metadata: {
        trigger: analytics.trigger,
      },
    })

    let unspeech: Awaited<ReturnType<AudioSpeechWsHandlersOptions['configKV']['getOptional']>>
    try {
      unspeech = await opts.configKV.getOptional('UNSPEECH_UPSTREAM')
    }
    catch (err) {
      log.withError(err).error('UNSPEECH_UPSTREAM read failed')
      closeWithError(1011, 'config_unavailable')
      return
    }

    const upstreamConfig = unspeech?.streaming
    if (!upstreamConfig || !upstreamConfig.baseURL || upstreamConfig.keys.length === 0) {
      closeWithError(1008, 'streaming_tts_not_configured')
      return
    }

    // Pre-flight balance check: refuse before dialing if the user cannot
    // afford the worst-case session.
    try {
      const flux = await opts.fluxService.getFlux(userId)
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
    const entry = upstreamConfig.keys[0]
    let keyPlaintext: Buffer
    try {
      keyPlaintext = opts.envelopeCrypto.decryptKey(entry.ciphertext, {
        modelName: STREAM_MODEL_LABEL_FALLBACK,
        keyEntryId: entry.id,
      })
    }
    catch (err) {
      log.withError(err).withFields({ keyEntryId: entry.id }).error('decrypt failed for streaming tts key')
      closeWithError(1011, 'decrypt_failed')
      return
    }

    const upstreamURL = upstreamConfig.baseURL
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
      finalize()
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
      finalize()
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

    // Sniff input chars from text frames so billing has a fallback when
    // upstream usage.text_words is absent. Only the `text` event contributes;
    // start/finish/cancel do not.
    if (!isBinary && typeof payload === 'string') {
      maybeAccountInputChars(payload)
    }

    if (!upstreamWs || !upstreamReady) {
      pendingClientFrames.push({ data: payload, isBinary })
      return
    }

    try {
      upstreamWs.send(payload, { binary: isBinary })
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
    if (upstreamWs && upstreamReady) {
      try {
        upstreamWs.send(JSON.stringify({ event: 'cancel' }))
      }
      catch {}
    }
    finalize()
  }

  function handleUpstreamMessage(data: RawData, isBinary: boolean) {
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
      }
    }
    catch {
      // Non-JSON text frame from client — ignore for billing, will fail
      // upstream-side anyway.
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
        balance_state: 'insufficient',
        billing_units: STREAMING_PREFLIGHT_CHARS_ESTIMATE,
        close_code: code,
        duration_ms: Date.now() - startedAt,
        trigger: analytics.trigger,
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

function isPaymentRequiredError(err: unknown): boolean {
  if (err instanceof ApiError)
    return err.statusCode === 402
  return typeof err === 'object'
    && err != null
    && 'statusCode' in err
    && (err as { statusCode?: unknown }).statusCode === 402
}
