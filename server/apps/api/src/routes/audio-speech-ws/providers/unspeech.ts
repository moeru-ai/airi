import type { RawData } from 'ws'

import type { StreamingTtsCommand, StreamingTtsProviderEvent, StreamingTtsTransport, StreamingTtsTransportOptions } from './types'

import WebSocket from 'ws'

import { errorMessageFrom } from '@moeru/std'

import { bufferToString, readUsageChars, toBufferLike } from '../protocol'

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10000
const DEFAULT_COMPLETION_TIMEOUT_MS = 30000

/**
 * unSpeech becomes `ready` when the websocket opens, then remains ready until
 * finish, completion, failure, close, or abort makes the transport terminal.
 */
type UnspeechPhase = 'connecting' | 'ready' | 'finishing' | 'terminal'

/** Wraps unSpeech's AIRI-compatible websocket protocol as a normalized transport. */
export function createUnspeechTransport(options: StreamingTtsTransportOptions): StreamingTtsTransport {
  let phase: UnspeechPhase = 'connecting'
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
      fail('unspeech_completion_timeout', 'unSpeech did not complete the streaming TTS session in time')
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
      fail('unspeech_send_failed', errorMessageFrom(error) ?? 'unSpeech websocket send failed')
      return false
    }
  }

  function sendCommand(command: StreamingTtsCommand) {
    if (phase === 'connecting') {
      pendingCommands.push(command)
      return
    }
    if (phase === 'terminal')
      return

    if (command.type === 'text') {
      if (sendJson({ event: 'text', text: command.text }))
        emit({ type: 'input-accepted', chars: command.text.length })
      return
    }

    if (sendJson({ event: 'finish' })) {
      phase = 'finishing'
      refreshCompletionDeadline()
    }
  }

  function handleControl(data: RawData) {
    let event: { event?: unknown, payload?: unknown }
    try {
      event = JSON.parse(bufferToString(data)) as { event?: unknown, payload?: unknown }
    }
    catch {
      fail('unspeech_invalid_event', 'unSpeech returned malformed JSON')
      return
    }

    const payload = isRecord(event.payload) ? event.payload : undefined
    if (phase === 'finishing' && event.event !== 'session.finished' && event.event !== 'error')
      refreshCompletionDeadline()
    switch (event.event) {
      case 'session.started':
        if (handshakeTimer)
          clearTimeout(handshakeTimer)
        handshakeTimer = undefined
        emit({ type: 'started' })
        return
      case 'sentence.start':
      case 'sentence.end':
      case 'subtitle':
        emit({ type: 'control', event: event.event, payload: payload ?? {} })
        return
      case 'session.finished':
        phase = 'terminal'
        clearDeadlines()
        emit({ type: 'completed', usageChars: readUsageChars(payload) ?? undefined })
        return
      case 'error':
        fail(
          typeof payload?.code === 'string' ? payload.code : 'unspeech_upstream_error',
          typeof payload?.message === 'string' ? payload.message : 'unSpeech streaming TTS failed',
        )
    }
  }

  ws.on('open', () => {
    if (phase !== 'connecting')
      return
    phase = 'ready'
    if (!sendJson({
      event: 'start',
      model: options.start.model,
      voice: options.start.voice,
      ...(options.start.responseFormat ? { response_format: options.start.responseFormat } : {}),
      ...(options.start.extraBody ? { extra_body: options.start.extraBody } : {}),
    })) {
      return
    }

    const commands = pendingCommands.splice(0)
    for (const command of commands)
      sendCommand(command)
  })
  ws.on('message', (data, isBinary) => {
    if (phase === 'terminal')
      return
    if (isBinary) {
      if (phase === 'finishing')
        refreshCompletionDeadline()
      emit({ type: 'audio', data: toBufferLike(data) })
      return
    }
    handleControl(data)
  })
  ws.on('error', error => fail('unspeech_upstream_error', error.message))
  ws.on('close', (code, reason) => {
    if (phase === 'terminal')
      return
    phase = 'terminal'
    clearDeadlines()
    pendingCommands.length = 0
    emit({ type: 'closed', code, reason: reason.toString() || 'unspeech_upstream_closed' })
  })

  handshakeTimer = setTimeout(() => {
    fail('unspeech_handshake_timeout', 'unSpeech did not start the streaming TTS session in time')
  }, handshakeTimeoutMs)

  return {
    kind: 'unspeech',
    upstreamURL: options.upstreamURL,
    keyEntryId: options.keyEntryId,
    send(command) {
      sendCommand(command)
    },
    abort() {
      const canCancel = phase === 'ready' || phase === 'finishing'
      phase = 'terminal'
      clearDeadlines()
      pendingCommands.length = 0
      if (canCancel) {
        try {
          ws.send(JSON.stringify({ event: 'cancel' }))
        }
        catch {}
      }
      try {
        ws.terminate()
      }
      catch {}
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}
