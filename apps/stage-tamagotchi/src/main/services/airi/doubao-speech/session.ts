import type {
  DoubaoSpeechRequest,
  DoubaoSpeechResponse,
  DoubaoSpeechSessionConfig,
} from '@proj-airi/stage-shared/doubao-speech'

import type { DoubaoSpeechEventValue } from './protocol'

import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'
import { parseDoubaoSpeechRequest } from '@proj-airi/stage-shared/doubao-speech'

import {
  decodeDoubaoSpeechMessage,
  DoubaoSpeechEvent,
  DoubaoSpeechMessageType,
  encodeDoubaoSpeechClientEvent,
} from './protocol'

export interface DoubaoSpeechTransport {
  readonly incoming: AsyncIterable<Uint8Array>
  readonly logId?: string
  close: () => void
  send: (data: Uint8Array) => void
}

export type CreateDoubaoSpeechTransport = (
  config: DoubaoSpeechSessionConfig,
  signal?: AbortSignal,
) => Promise<DoubaoSpeechTransport>

interface DoubaoRequestParams {
  audio_params: {
    format: DoubaoSpeechSessionConfig['audio']['format']
    loudness_rate: number
    sample_rate: number
    speech_rate: number
  }
  context_texts?: string[]
  explicit_dialect?: string
  explicit_language?: string
  post_process: { pitch: number }
  speaker: string
  text?: string
}

interface DoubaoSessionPayload {
  event: number
  req_params: DoubaoRequestParams
}

function createRequestParams(config: DoubaoSpeechSessionConfig): DoubaoRequestParams {
  const params: DoubaoRequestParams = {
    audio_params: {
      format: config.audio.format,
      loudness_rate: config.audio.loudnessRate,
      sample_rate: config.audio.sampleRate,
      speech_rate: config.audio.speechRate,
    },
    post_process: { pitch: config.audio.pitch },
    speaker: config.speaker,
  }

  if (config.explicitLanguage)
    params.explicit_language = config.explicitLanguage
  if (config.explicitDialect)
    params.explicit_dialect = config.explicitDialect
  if (config.resourceId === 'seed-tts-2.0' && config.voiceInstruction)
    params.context_texts = [config.voiceInstruction]

  return params
}

/** Builds the JSON payload carried by the StartSession binary event. */
export function createDoubaoSessionPayload(config: DoubaoSpeechSessionConfig): DoubaoSessionPayload {
  return {
    event: DoubaoSpeechEvent.StartSession,
    req_params: createRequestParams(config),
  }
}

/** Builds one TaskRequest payload while preserving the session voice settings. */
export function createDoubaoTaskPayload(config: DoubaoSpeechSessionConfig, text: string): DoubaoSessionPayload {
  return {
    event: DoubaoSpeechEvent.TaskRequest,
    req_params: {
      ...createRequestParams(config),
      text,
    },
  }
}

function encodeJsonEvent(event: DoubaoSpeechEventValue, payload: unknown, sessionId?: string) {
  return encodeDoubaoSpeechClientEvent({
    event,
    payload: new TextEncoder().encode(JSON.stringify(payload)),
    sessionId,
  })
}

function payloadRecord(payload: Uint8Array): Record<string, unknown> {
  if (payload.byteLength === 0)
    return {}

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payload))
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

function failureMessage(payload: Uint8Array, fallback: string) {
  const record = payloadRecord(payload)
  for (const key of ['message', 'error', 'detail']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim())
      return value
  }
  return fallback
}

function assertSuccessfulMessage(message: ReturnType<typeof decodeDoubaoSpeechMessage>, logId?: string) {
  const failedEvent = message.event === DoubaoSpeechEvent.ConnectionFailed
    || message.event === DoubaoSpeechEvent.SessionFailed
  if (message.messageType !== DoubaoSpeechMessageType.Error && !failedEvent)
    return

  const code = message.errorCode ?? message.event ?? 'upstream_error'
  const diagnostic = logId ? ` Log ID: ${logId}.` : ''
  throw new Error(`Doubao speech ${code}: ${failureMessage(message.payload, 'The upstream request failed.')}${diagnostic}`)
}

async function readExpectedEvent(
  incoming: AsyncIterator<Uint8Array>,
  expectedEvent: number,
  expectedType: number,
  logId?: string,
) {
  const next = await incoming.next()
  if (next.done)
    throw new Error(`Doubao speech connection closed before event ${expectedEvent}.`)

  const message = decodeDoubaoSpeechMessage(next.value)
  assertSuccessfulMessage(message, logId)
  if (message.messageType !== expectedType || message.event !== expectedEvent) {
    throw new Error(
      `Unexpected Doubao speech event ${String(message.event)} with message type ${message.messageType}; expected ${expectedEvent}.`,
    )
  }
  return message
}

async function pumpTextRequests(
  requests: AsyncIterator<DoubaoSpeechRequest>,
  transport: DoubaoSpeechTransport,
  config: DoubaoSpeechSessionConfig,
  sessionId: string,
  signal?: AbortSignal,
) {
  let ended = false

  for (;;) {
    signal?.throwIfAborted()
    const next = await requests.next()
    if (next.done)
      break

    const request = parseDoubaoSpeechRequest(next.value)
    if (request.type === 'start')
      throw new TypeError('A Doubao speech stream can contain only one start request.')

    if (request.type === 'text') {
      if (request.text.length > 0) {
        transport.send(encodeJsonEvent(
          DoubaoSpeechEvent.TaskRequest,
          createDoubaoTaskPayload(config, request.text),
          sessionId,
        ))
      }
      continue
    }

    const event = request.type === 'cancel'
      ? DoubaoSpeechEvent.CancelSession
      : DoubaoSpeechEvent.FinishSession
    transport.send(encodeJsonEvent(event, {}, sessionId))
    ended = true
    break
  }

  if (!ended)
    transport.send(encodeJsonEvent(DoubaoSpeechEvent.FinishSession, {}, sessionId))
}

function controlResponse(
  event: Exclude<DoubaoSpeechResponse, { type: 'audio' }>['event'],
  payload?: Record<string, unknown>,
): DoubaoSpeechResponse {
  return payload && Object.keys(payload).length > 0
    ? { type: 'control', event, payload }
    : { type: 'control', event }
}

/**
 * Runs one Doubao connection and one synthesis session over a request stream.
 *
 * The first request owns persisted configuration. Later requests carry text or
 * one terminal action. The connection is isolated by a generated session id,
 * and a mismatched response id terminates the stream.
 */
export async function* runDoubaoSpeechSession(
  requestSource: AsyncIterable<DoubaoSpeechRequest>,
  createTransport: CreateDoubaoSpeechTransport,
  signal?: AbortSignal,
): AsyncGenerator<DoubaoSpeechResponse, void, unknown> {
  const requests = requestSource[Symbol.asyncIterator]()
  const first = await requests.next()
  if (first.done)
    throw new TypeError('Doubao speech requires a start request.')

  const start = parseDoubaoSpeechRequest(first.value)
  if (start.type !== 'start')
    throw new TypeError('The first Doubao speech request must contain configuration.')

  signal?.throwIfAborted()
  const transport = await createTransport(start.config, signal)
  const incoming = transport.incoming[Symbol.asyncIterator]()
  const sessionId = randomUUID()
  let sessionStarted = false
  let sessionFinished = false

  const cancelUpstream = () => {
    if (sessionStarted && !sessionFinished) {
      try {
        transport.send(encodeJsonEvent(DoubaoSpeechEvent.CancelSession, {}, sessionId))
      }
      catch {}
    }
    transport.close()
  }
  signal?.addEventListener('abort', cancelUpstream, { once: true })

  try {
    transport.send(encodeJsonEvent(DoubaoSpeechEvent.StartConnection, {}))
    await readExpectedEvent(
      incoming,
      DoubaoSpeechEvent.ConnectionStarted,
      DoubaoSpeechMessageType.FullServerResponse,
      transport.logId,
    )

    transport.send(encodeJsonEvent(
      DoubaoSpeechEvent.StartSession,
      createDoubaoSessionPayload(start.config),
      sessionId,
    ))
    const started = await readExpectedEvent(
      incoming,
      DoubaoSpeechEvent.SessionStarted,
      DoubaoSpeechMessageType.FullServerResponse,
      transport.logId,
    )
    if (started.sessionId && started.sessionId !== sessionId)
      throw new Error('Doubao speech returned a mismatched session id.')
    sessionStarted = true
    yield controlResponse('session.started', payloadRecord(started.payload))

    let rejectInput: (reason?: unknown) => void = () => {}
    const inputFailure = new Promise<never>((_resolve, reject) => {
      rejectInput = reject
    })
    const inputPump = pumpTextRequests(requests, transport, start.config, sessionId, signal)
      .catch((error) => {
        rejectInput(error)
        throw error
      })
    void inputPump.catch(() => {})

    for (;;) {
      const next = await Promise.race([incoming.next(), inputFailure])
      if (next.done)
        throw new Error('Doubao speech connection closed before ConnectionFinished.')

      const message = decodeDoubaoSpeechMessage(next.value)
      assertSuccessfulMessage(message, transport.logId)
      if (message.sessionId && message.sessionId !== sessionId)
        throw new Error('Doubao speech returned an event for another session.')

      const payload = payloadRecord(message.payload)
      switch (message.event) {
        case DoubaoSpeechEvent.TTSResponse:
          if (message.messageType !== DoubaoSpeechMessageType.AudioOnlyServer)
            throw new Error('Doubao speech returned TTSResponse without binary audio.')
          yield { type: 'audio', data: message.payload }
          break
        case DoubaoSpeechEvent.TTSSentenceStart:
          yield controlResponse('sentence.start', payload)
          break
        case DoubaoSpeechEvent.TTSSentenceEnd:
          yield controlResponse('sentence.end', payload)
          break
        case DoubaoSpeechEvent.TTSSubtitle:
          yield controlResponse('subtitle', payload)
          break
        case DoubaoSpeechEvent.SessionCanceled:
        case DoubaoSpeechEvent.SessionFinished:
          sessionFinished = true
          transport.send(encodeJsonEvent(DoubaoSpeechEvent.FinishConnection, {}))
          yield controlResponse('session.finished', payload)
          break
        case DoubaoSpeechEvent.ConnectionFinished:
          if (!sessionFinished)
            throw new Error('Doubao speech connection finished before the session.')
          await inputPump
          return
        default:
          // Usage and other informational responses do not change session state.
          break
      }
    }
  }
  catch (error) {
    throw new Error(errorMessageFrom(error) ?? 'Doubao speech session failed.', { cause: error })
  }
  finally {
    signal?.removeEventListener('abort', cancelUpstream)
    transport.close()
    await requests.return?.()
    await incoming.return?.()
  }
}
