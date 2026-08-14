import type { Buffer } from 'node:buffer'

import type { WSContext } from 'hono/ws'

import type { StreamingTtsProviderEvent, StreamingTtsStartCommand, StreamingTtsTransport } from './providers/types'
import type { AudioSpeechWsHandlersOptions } from './types'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { context as otelContext, SpanStatusCode, trace } from '@opentelemetry/api'

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
import { resolveStreamingTtsProvider, StreamingTtsResolutionError } from './provider'
import { createStepfunTransport } from './providers/stepfun'
import { createUnspeechTransport } from './providers/unspeech'

const log = useLogger('audio-speech-ws').useGlobalConfig()

const STREAMING_PREFLIGHT_CHARS_ESTIMATE = 2000
const MAX_STREAMING_INPUT_CHARS = 20000
const MAX_STREAMING_TEXT_FRAMES = 512
const STREAM_MODEL_LABEL_FALLBACK = 'streaming-tts'

const tracer = trace.getTracer('audio-speech-ws')

/**
 * One-way lifecycle for a client session. `settling` is entered exactly once
 * before transport shutdown and owns all asynchronous persistence work.
 */
type SessionPhase = 'awaiting-start' | 'connecting' | 'streaming' | 'finishing' | 'settling' | 'closed'

interface SessionOutcome {
  kind: 'completed' | 'cancelled' | 'failed' | 'blocked'
  status: number
  reason: string
}

type ClientCommand
  = | { type: 'start', value: StreamingTtsStartCommand }
    | { type: 'text', text: string }
    | { type: 'finish' }
    | { type: 'cancel' }

/** Mutable state for one streaming speech websocket connection. */
export interface AudioSpeechSessionState {
  attachClient: (ws: WSContext) => void
  handleClientMessage: (message: { data: unknown }, ws: WSContext) => void
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
 * Creates a provider-neutral streaming TTS session.
 *
 * The session owns client command ordering, affordability, bounded input,
 * billing, telemetry, and one terminal outcome. Provider websocket protocols
 * remain behind {@link StreamingTtsTransport}.
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
    attributes: { [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech_stream' },
  })

  let phase: SessionPhase = 'awaiting-start'
  let clientWs: WSContext | null = null
  let transport: StreamingTtsTransport | null = null
  let messageChain = Promise.resolve()
  let receivedInputChars = 0
  let acceptedInputChars = 0
  let textFrameCount = 0
  let affordabilityCheckedChars = 0
  let preflightFluxBalance: number | undefined
  let modelLabel = STREAM_MODEL_LABEL_FALLBACK
  let voiceLabel: string | undefined
  let providerLabel: 'unspeech' | 'stepfun' | undefined

  function attachClient(ws: WSContext) {
    clientWs = ws
  }

  function handleClientMessage(message: { data: unknown }, ws: WSContext) {
    if (isTerminalPhase())
      return

    const command = parseClientCommand(message.data)
    // Cancel is an out-of-band terminal command. It must not wait behind
    // provider/configuration I/O already queued by start or text commands.
    if (command?.type === 'cancel') {
      settleSession({ kind: 'cancelled', status: 499, reason: 'client_cancelled' })
      return
    }

    messageChain = messageChain
      .then(() => processClientCommand(command))
      .catch((error) => {
        log.withError(error).warn('streaming tts client command failed')
        failSession(errorCode(error), errorMessageFrom(error) ?? 'Streaming TTS client command failed')
        try {
          ws.close(1011, errorCode(error))
        }
        catch {}
      })
  }

  function handleClientClose() {
    settleSession({ kind: 'cancelled', status: 499, reason: 'client_disconnected' })
  }

  async function processClientCommand(command: ClientCommand | null) {
    if (phase === 'settling' || phase === 'closed')
      return

    if (!command) {
      failSession('invalid_client_frame', 'Invalid streaming TTS client frame', 1008)
      return
    }

    if (command.type === 'start') {
      if (phase !== 'awaiting-start') {
        failSession('unexpected_start_frame', 'Streaming TTS start frame must be sent exactly once', 1008)
        return
      }
      await startSession(command.value)
      return
    }

    if (phase === 'awaiting-start') {
      failSession('invalid_start_frame', 'The first streaming TTS frame must be start', 1008)
      return
    }

    // `handleClientMessage` settles cancel before queueing. Keep this guard so
    // the command union remains exhaustive if another caller is introduced.
    if (command.type === 'cancel') {
      settleSession({ kind: 'cancelled', status: 499, reason: 'client_cancelled' })
      return
    }

    if (!transport || isTerminalPhase())
      return

    if (command.type === 'finish') {
      if (phase === 'finishing') {
        failSession('duplicate_finish_frame', 'Streaming TTS finish frame was already sent', 1008)
        return
      }
      phase = 'finishing'
      transport.send({ type: 'finish' })
      return
    }

    if (phase === 'finishing') {
      failSession('text_after_finish', 'Streaming TTS text cannot follow finish', 1008)
      return
    }

    const nextChars = receivedInputChars + command.text.length
    const nextFrames = textFrameCount + 1
    if (nextChars > MAX_STREAMING_INPUT_CHARS || nextFrames > MAX_STREAMING_TEXT_FRAMES) {
      failSession('streaming_tts_input_limit_exceeded', 'Streaming TTS session input exceeds the configured limit', 1009)
      return
    }

    await ensureAffordable(nextChars)
    if (isTerminalPhase())
      return
    receivedInputChars = nextChars
    textFrameCount = nextFrames
    transport.send({ type: 'text', text: command.text })
  }

  async function startSession(start: StreamingTtsStartCommand) {
    phase = 'connecting'
    modelLabel = start.model
    voiceLabel = start.voice

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

    let resolved
    try {
      resolved = await resolveStreamingTtsProvider(start, opts.configKV)
    }
    catch (error) {
      if (error instanceof StreamingTtsResolutionError) {
        failSession(error.code, error.message, error.closeCode)
        return
      }
      throw error
    }
    if (isTerminalPhase())
      return

    try {
      const flux = await opts.fluxService.getFlux(userId)
      preflightFluxBalance = flux.flux
      await opts.ttsMeter.assertCanAfford(userId, STREAMING_PREFLIGHT_CHARS_ESTIMATE, flux.flux)
      affordabilityCheckedChars = STREAMING_PREFLIGHT_CHARS_ESTIMATE
    }
    catch (error) {
      if (isPaymentRequiredError(error)) {
        blockForInsufficientBalance()
        return
      }
      failSession('flux_preflight_failed', 'Streaming TTS affordability check failed')
      return
    }
    if (isTerminalPhase())
      return

    const key = resolved.keys[0]
    let keyPlaintext: Buffer
    try {
      keyPlaintext = opts.envelopeCrypto.decryptKey(key.ciphertext, {
        modelName: resolved.keyContext,
        keyEntryId: key.id,
      })
    }
    catch (error) {
      log.withError(error).withFields({ keyEntryId: key.id }).error('decrypt failed for streaming tts key')
      failSession('decrypt_failed', 'Streaming TTS credential could not be decrypted')
      return
    }

    providerLabel = resolved.kind
    span.setAttribute(AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL, resolved.upstreamURL)
    span.setAttribute(AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID, key.id)
    span.setAttribute(GEN_AI_ATTR_REQUEST_MODEL, modelLabel)

    const transportOptions = {
      start,
      upstreamURL: resolved.upstreamURL,
      keyEntryId: key.id,
      keyPlaintext,
      onEvent: handleProviderEvent,
      timeouts: opts.streamingTtsTimeouts,
    }
    try {
      transport = resolved.kind === 'stepfun'
        ? createStepfunTransport({ ...transportOptions, instruction: resolved.instruction })
        : createUnspeechTransport(transportOptions)
    }
    catch (error) {
      keyPlaintext.fill(0)
      failSession('upstream_connect_failed', errorMessageFrom(error) ?? 'Streaming TTS upstream connection failed')
    }
  }

  async function ensureAffordable(nextChars: number) {
    if (nextChars <= affordabilityCheckedChars)
      return
    if (preflightFluxBalance === undefined)
      throw new Error('Streaming TTS affordability state is unavailable')

    const nextCheck = Math.ceil(nextChars / STREAMING_PREFLIGHT_CHARS_ESTIMATE) * STREAMING_PREFLIGHT_CHARS_ESTIMATE
    try {
      await opts.ttsMeter.assertCanAfford(userId, nextCheck, preflightFluxBalance)
      affordabilityCheckedChars = nextCheck
    }
    catch (error) {
      if (isPaymentRequiredError(error)) {
        blockForInsufficientBalance(nextCheck)
        return
      }
      throw error
    }
  }

  function handleProviderEvent(event: StreamingTtsProviderEvent) {
    if (phase === 'settling' || phase === 'closed')
      return

    switch (event.type) {
      case 'started':
        if (phase === 'connecting')
          phase = 'streaming'
        sendClient({ event: 'session.started' })
        return
      case 'input-accepted':
        acceptedInputChars += event.chars
        return
      case 'audio':
        if (!sendClient(event.data))
          settleSession({ kind: 'cancelled', status: 499, reason: 'client_unavailable' })
        return
      case 'control':
        if (!sendClient({ event: event.event, payload: event.payload }))
          settleSession({ kind: 'cancelled', status: 499, reason: 'client_unavailable' })
        return
      case 'completed':
        sendClient({ event: 'session.finished' })
        settleSession(
          { kind: 'completed', status: 200, reason: 'session_finished' },
          Math.max(event.usageChars ?? 0, acceptedInputChars),
        )
        return
      case 'failed':
        sendClient({ event: 'error', code: event.code, message: event.message })
        settleSession({ kind: 'failed', status: 502, reason: event.code })
        return
      case 'closed':
        settleSession({ kind: 'failed', status: 502, reason: event.reason || `upstream_closed_${event.code}` })
    }
  }

  function failSession(code: string, message: string, closeCode = 1011) {
    if (phase === 'settling' || phase === 'closed')
      return
    span.setStatus({ code: SpanStatusCode.ERROR, message: code })
    sendClient({ event: 'error', code, message })
    settleSession(
      { kind: 'failed', status: closeCode === 1008 || closeCode === 1009 ? 400 : 500, reason: code },
      acceptedInputChars,
      { code: closeCode, reason: code },
    )
  }

  function settleSession(
    outcome: SessionOutcome,
    units = acceptedInputChars,
    clientClose?: { code: number, reason: string },
  ) {
    if (phase === 'settling' || phase === 'closed')
      return
    phase = 'settling'

    // Closing transport and client is synchronous with the terminal decision.
    // Billing and logging must never keep provider generation alive.
    transport?.abort()
    closeClient(clientClose?.code, clientClose?.reason)

    if (outcome.kind !== 'completed')
      span.setStatus({ code: SpanStatusCode.ERROR, message: outcome.reason })

    void persistOutcome(outcome, units).finally(() => {
      if (phase === 'closed')
        return
      phase = 'closed'
      span.end()
    })
  }

  async function persistOutcome(outcome: SessionOutcome, units: number) {
    let fluxConsumed = 0
    if (units > 0) {
      try {
        const flux = await opts.fluxService.getFlux(userId)
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
      catch (error) {
        log.withError(error).withFields({ userId, units, reason: outcome.reason }).error('billing accumulate failed for streaming tts')
        span.recordException(error as Error)
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'billing_failed' })
      }
    }

    const durationMs = Date.now() - startedAt
    try {
      await opts.requestLogService.logRequest({
        userId,
        model: modelLabel,
        status: outcome.status,
        durationMs,
        fluxConsumed,
      })
    }
    catch (error) {
      log.withError(error).warn('failed to write request log for streaming tts')
    }

    const common = {
      userId,
      feature: 'tts' as const,
      source: analytics.source,
      model: modelLabel,
      provider: providerLabel,
      metadata: {
        input_chars: units,
        duration_ms: durationMs,
        flux_consumed: fluxConsumed,
        trigger: analytics.trigger,
        ...streamingVoiceMetadata(voiceLabel, analytics.voiceType),
      },
    }
    if (outcome.kind === 'completed') {
      void opts.productEventService.track({
        ...common,
        action: 'speech_succeeded',
        status: 'succeeded',
      })
    }
    else if (outcome.kind === 'blocked') {
      void opts.productEventService.track({
        ...common,
        action: 'speech_blocked',
        status: 'blocked',
        reason: 'insufficient_balance',
        metadata: {
          ...common.metadata,
          block_reason: 'insufficient_balance',
          balance_state: 'insufficient',
          flux_balance_bucket: fluxBalanceBucket(preflightFluxBalance),
        },
      })
    }
    else if (outcome.kind === 'cancelled') {
      void opts.productEventService.track({
        ...common,
        action: 'speech_cancelled',
        status: 'cancelled',
        reason: outcome.reason,
      })
    }
    else {
      void opts.productEventService.track({
        ...common,
        action: 'speech_failed',
        status: 'failed',
        reason: outcome.reason,
      })
    }
  }

  function blockForInsufficientBalance(requiredUnits = STREAMING_PREFLIGHT_CHARS_ESTIMATE) {
    if (isTerminalPhase())
      return
    sendClient({ event: 'error', code: 'insufficient_flux', message: 'insufficient_flux' })
    settleSession(
      { kind: 'blocked', status: 402, reason: 'insufficient_balance' },
      acceptedInputChars,
      { code: 1008, reason: 'insufficient_flux' },
    )
    span.setAttribute('airi.billing.required_units', requiredUnits)
  }

  function sendClient(value: Record<string, unknown> | ArrayBuffer): boolean {
    if (!clientWs)
      return false
    try {
      clientWs.send(value instanceof ArrayBuffer ? value : JSON.stringify(value))
      return true
    }
    catch (error) {
      log.withError(error).warn('failed to send streaming tts frame to client')
      return false
    }
  }

  function closeClient(code?: number, reason?: string) {
    try {
      clientWs?.close(code, reason)
    }
    catch {}
  }

  function isTerminalPhase() {
    return phase === 'settling' || phase === 'closed'
  }

  return { attachClient, handleClientMessage, handleClientClose }
}

function parseClientCommand(data: unknown): ClientCommand | null {
  if (typeof data !== 'string')
    return null

  let parsed: Record<string, unknown>
  try {
    const value = JSON.parse(data) as unknown
    if (!isRecord(value))
      return null
    parsed = value
  }
  catch {
    return null
  }

  switch (parsed.event) {
    case 'start':
      if (typeof parsed.model !== 'string' || parsed.model.length === 0)
        return null
      if (typeof parsed.voice !== 'string' || parsed.voice.length === 0)
        return null
      return {
        type: 'start',
        value: {
          model: parsed.model,
          voice: parsed.voice,
          responseFormat: typeof parsed.response_format === 'string' ? parsed.response_format : undefined,
          extraBody: isRecord(parsed.extra_body) ? parsed.extra_body : undefined,
        },
      }
    case 'text':
      return typeof parsed.text === 'string' && parsed.text.length > 0
        ? { type: 'text', text: parsed.text }
        : null
    case 'finish':
      return { type: 'finish' }
    case 'cancel':
      return { type: 'cancel' }
    default:
      return null
  }
}

function normalizeAnalytics(input: AudioSpeechSessionAnalytics): Required<AudioSpeechSessionAnalytics> {
  return {
    trigger: input.trigger === 'auto' ? 'auto' : 'manual',
    source: normalizeSource(input.source),
    voiceType: normalizeVoiceType(input.voiceType),
  }
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

function streamingVoiceMetadata(voiceId: string | undefined, voiceType: StreamingTtsVoiceType): Record<string, unknown> {
  return {
    ...(voiceId ? { voice_id: voiceId } : {}),
    voice_type: voiceType,
  }
}

function isPaymentRequiredError(error: unknown): boolean {
  if (error instanceof ApiError)
    return error.statusCode === 402
  return isRecord(error) && error.statusCode === 402
}

function errorCode(error: unknown): string {
  return error instanceof StreamingTtsResolutionError ? error.code : 'streaming_tts_internal_error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
