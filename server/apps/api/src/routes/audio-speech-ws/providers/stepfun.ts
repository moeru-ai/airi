import type { RawData } from 'ws'

import type { StreamingTtsCommand, StreamingTtsProviderEvent, StreamingTtsTransport, StreamingTtsTransportOptions } from './types'

import { Buffer } from 'node:buffer'

import WebSocket from 'ws'

import { errorMessageFrom } from '@moeru/std'
import { looseObject, optional, record, safeParse, string, unknown as unknownValue } from 'valibot'

const StepfunServerEventSchema = looseObject({
  type: string(),
  data: optional(record(string(), unknownValue())),
})

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10000
const DEFAULT_COMPLETION_TIMEOUT_MS = 30000

/**
 * `connecting -> creating -> ready -> finishing -> terminal` mirrors the
 * StepFun handshake. Error, close, and abort may enter `terminal` from any
 * phase; buffered AIRI commands are released only after `response.created`.
 */
type StepfunPhase = 'connecting' | 'creating' | 'ready' | 'finishing' | 'terminal'

/**
 * Creates a native StepFun streaming TTS transport.
 *
 * The adapter owns StepFun's ordered handshake, session correlation, JSON
 * envelope, Base64 decoding, format selection, and command buffering. Callers
 * only observe AIRI's provider-neutral streaming events.
 */
export function createStepfunTransport(options: StreamingTtsTransportOptions & { instruction?: string }): StreamingTtsTransport {
  let phase: StepfunPhase = 'connecting'
  let sessionId: string | null = null
  const pendingCommands: StreamingTtsCommand[] = []
  const handshakeTimeoutMs = options.timeouts?.handshakeMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
  const completionTimeoutMs = options.timeouts?.completionMs ?? DEFAULT_COMPLETION_TIMEOUT_MS
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined
  let completionTimer: ReturnType<typeof setTimeout> | undefined

  let ws: WebSocket
  try {
    ws = new WebSocket(options.upstreamURL, {
      headers: { Authorization: `Bearer ${options.keyPlaintext.toString('utf8')}` },
    })
  }
  finally {
    options.keyPlaintext.fill(0)
  }

  function emit(event: StreamingTtsProviderEvent) {
    options.onEvent(event)
  }

  function clearDeadlines() {
    if (handshakeTimer)
      clearTimeout(handshakeTimer)
    if (completionTimer)
      clearTimeout(completionTimer)
    handshakeTimer = undefined
    completionTimer = undefined
  }

  function refreshCompletionDeadline() {
    if (completionTimer)
      clearTimeout(completionTimer)
    completionTimer = setTimeout(() => {
      fail('stepfun_completion_timeout', 'StepFun did not complete the streaming TTS session in time')
    }, completionTimeoutMs)
  }

  function fail(code: string, message: string) {
    if (phase === 'terminal')
      return
    phase = 'terminal'
    clearDeadlines()
    pendingCommands.length = 0
    emit({ type: 'failed', code, message })
    try {
      ws.terminate()
    }
    catch {}
  }

  function sendJson(value: Record<string, unknown>): boolean {
    try {
      ws.send(JSON.stringify(value))
      return true
    }
    catch (error) {
      fail('stepfun_send_failed', errorMessageFrom(error) ?? 'StepFun websocket send failed')
      return false
    }
  }

  function sendCommand(command: StreamingTtsCommand) {
    if (!sessionId || (phase !== 'ready' && phase !== 'finishing')) {
      pendingCommands.push(command)
      return
    }

    if (command.type === 'text') {
      for (const text of splitText(command.text)) {
        if (!sendJson({ type: 'tts.text.delta', data: { session_id: sessionId, text } }))
          return
        emit({ type: 'input-accepted', chars: text.length })
      }
      return
    }

    if (sendJson({ type: 'tts.text.done', data: { session_id: sessionId } })) {
      phase = 'finishing'
      refreshCompletionDeadline()
    }
  }

  function flushPendingCommands() {
    const commands = pendingCommands.splice(0)
    for (const command of commands) {
      if (phase === 'terminal')
        return
      sendCommand(command)
    }
  }

  function requireCurrentSession(data: Record<string, unknown> | undefined): boolean {
    const eventSessionId = stringField(data, 'session_id')
    if (sessionId && eventSessionId === sessionId)
      return true
    fail('stepfun_session_mismatch', 'StepFun returned an event for an unexpected session')
    return false
  }

  function handleMessage(data: RawData, isBinary: boolean) {
    if (phase === 'terminal')
      return
    if (isBinary) {
      fail('stepfun_invalid_binary_event', 'StepFun unexpectedly returned a binary websocket frame')
      return
    }

    const parsed = safeParse(StepfunServerEventSchema, JSON.parse(bufferToString(data)))
    if (!parsed.success) {
      fail('stepfun_invalid_event', 'StepFun returned a malformed websocket event')
      return
    }

    const event = parsed.output
    switch (event.type) {
      case 'tts.connection.done': {
        if (phase !== 'connecting') {
          fail('stepfun_invalid_transition', `Unexpected ${event.type} while ${phase}`)
          return
        }
        sessionId = stringField(event.data, 'session_id') ?? null
        if (!sessionId) {
          fail('stepfun_invalid_event', 'StepFun connection event omitted session_id')
          return
        }
        phase = 'creating'
        sendJson(createFrame(sessionId, options))
        return
      }
      case 'tts.response.created': {
        if (phase !== 'creating' || !requireCurrentSession(event.data))
          return
        phase = 'ready'
        if (handshakeTimer)
          clearTimeout(handshakeTimer)
        handshakeTimer = undefined
        emit({ type: 'started' })
        flushPendingCommands()
        return
      }
      case 'tts.response.sentence.start':
      case 'tts.response.sentence.end':
      case 'tts.response.subtitle': {
        if ((phase !== 'ready' && phase !== 'finishing') || !requireCurrentSession(event.data))
          return
        if (phase === 'finishing')
          refreshCompletionDeadline()
        const controlEvent = event.type.replace('tts.response.', '') as 'sentence.start' | 'sentence.end' | 'subtitle'
        emit({ type: 'control', event: controlEvent, payload: event.data ?? {} })
        return
      }
      case 'tts.response.audio.delta': {
        if ((phase !== 'ready' && phase !== 'finishing') || !requireCurrentSession(event.data))
          return
        if (phase === 'finishing')
          refreshCompletionDeadline()
        const audio = stringField(event.data, 'audio')
        if (!audio) {
          fail('stepfun_invalid_audio_event', 'StepFun audio delta omitted audio')
          return
        }
        const bytes = Buffer.from(audio, 'base64')
        if (bytes.byteLength === 0) {
          fail('stepfun_invalid_audio_event', 'StepFun audio delta contained invalid Base64')
          return
        }
        emit({ type: 'audio', data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer })
        return
      }
      case 'tts.response.audio.done': {
        if ((phase !== 'ready' && phase !== 'finishing') || !requireCurrentSession(event.data))
          return
        phase = 'terminal'
        clearDeadlines()
        emit({ type: 'completed' })
        return
      }
      case 'tts.response.error': {
        const eventSessionId = stringField(event.data, 'session_id')
        if (eventSessionId && sessionId && eventSessionId !== sessionId) {
          fail('stepfun_session_mismatch', 'StepFun returned an error for an unexpected session')
          return
        }
        fail(
          stringField(event.data, 'code') ?? 'stepfun_upstream_error',
          stringField(event.data, 'message') ?? 'StepFun streaming TTS failed',
        )
        return
      }
      default:
        fail('stepfun_unknown_event', `Unsupported StepFun event: ${event.type}`)
    }
  }

  ws.on('message', (data, isBinary) => {
    try {
      handleMessage(data, isBinary)
    }
    catch (error) {
      fail('stepfun_invalid_event', errorMessageFrom(error) ?? 'StepFun returned an invalid event')
    }
  })
  ws.on('error', error => fail('stepfun_upstream_error', error.message))
  ws.on('close', (code, reason) => {
    if (phase === 'terminal')
      return
    phase = 'terminal'
    clearDeadlines()
    pendingCommands.length = 0
    emit({ type: 'closed', code, reason: reason.toString() || 'stepfun_upstream_closed' })
  })

  handshakeTimer = setTimeout(() => {
    fail('stepfun_handshake_timeout', 'StepFun did not create the streaming TTS session in time')
  }, handshakeTimeoutMs)

  return {
    kind: 'stepfun',
    upstreamURL: options.upstreamURL,
    keyEntryId: options.keyEntryId,
    send(command) {
      if (phase === 'terminal')
        return
      sendCommand(command)
    },
    abort() {
      phase = 'terminal'
      clearDeadlines()
      pendingCommands.length = 0
      try {
        ws.terminate()
      }
      catch {}
    },
  }
}

function createFrame(sessionId: string, options: StreamingTtsTransportOptions & { instruction?: string }): Record<string, unknown> {
  const extraBody = options.start.extraBody ?? {}
  const sampleRate = numberField(extraBody, 'sample_rate')
    ?? numberField(recordField(extraBody, 'audio'), 'sample_rate')
  const speedRatio = numberField(extraBody, 'speed_ratio')
  const volumeRatio = numberField(extraBody, 'volume_ratio')
  const instruction = stringField(extraBody, 'instruction') ?? options.instruction

  return {
    type: 'tts.create',
    data: {
      session_id: sessionId,
      voice_id: options.start.voice,
      response_format: streamingFormat(options.start.responseFormat),
      text_normalization: 'standard',
      mode: 'default',
      ...(sampleRate !== undefined ? { sample_rate: sampleRate } : {}),
      ...(speedRatio !== undefined ? { speed_ratio: speedRatio } : {}),
      ...(volumeRatio !== undefined ? { volume_ratio: volumeRatio } : {}),
      ...(instruction ? { instruction } : {}),
    },
  }
}

function streamingFormat(value: string | undefined): 'mp3_stream' | 'opus_stream' | 'flac_stream' {
  switch (value) {
    case 'opus':
      return 'opus_stream'
    case 'flac':
      return 'flac_stream'
    default:
      return 'mp3_stream'
  }
}

/** Splits at Unicode code-point boundaries because StepFun caps one delta at 1000 characters. */
function splitText(text: string): string[] {
  const characters = Array.from(text)
  const chunks: string[] = []
  for (let start = 0; start < characters.length; start += 1000)
    chunks.push(characters.slice(start, start + 1000).join(''))
  return chunks
}

function bufferToString(data: RawData): string {
  if (Array.isArray(data))
    return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer)
    return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function recordField(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key]
  return typeof value === 'object' && value != null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
