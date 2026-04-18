import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

import type { PepTutorBackendAuthConfig } from '../../../utils/peptutor-backend-auth'

import {
  appendPepTutorBackendAuthQuery,
  resolvePepTutorBackendAuth,
} from '../../../utils/peptutor-backend-auth'
import { bootstrapPepTutorBackendAuth } from '../../peptutor-backend-auth'

const DEFAULT_DOUBAO_REALTIME_PROXY_PATH = '/api/peptutor/doubao-realtime-asr'
const DEFAULT_DOUBAO_REALTIME_MODEL = '1.2.1.1'
const DEFAULT_DOUBAO_REALTIME_APP_KEY = 'PlgvMymc7f3tQnJ6'
const DEFAULT_DOUBAO_REALTIME_RESOURCE_ID = 'volc.speech.dialog'

function resolveBaseOrigin(): string {
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin) {
    return globalThis.location.origin
  }

  return 'http://localhost'
}

type AudioChunk = ArrayBuffer | ArrayBufferView

type DoubaoRealtimeBrowserMessage
  = | { type: 'ready', sessionId?: string, dialogId?: string }
    | { type: 'connection-started' }
    | { type: 'asr-info', questionId?: string, payload?: Record<string, unknown> }
    | { type: 'asr-response', results?: unknown[], payload?: Record<string, unknown> }
    | { type: 'asr-ended' }
    | { type: 'error', error?: string, statusCode?: number }

export interface DoubaoRealtimeSpeechExtraOptions {
  abortSignal?: AbortSignal
  inputAudioStream?: ReadableStream<AudioChunk>
  proxyAuth?: PepTutorBackendAuthConfig
  asr?: {
    audio_info?: {
      format?: string
      sample_rate?: number
      channel?: number
    }
    extra?: Record<string, unknown>
  }
  dialog?: {
    extra?: Record<string, unknown>
  }
}

export interface DoubaoRealtimeTranscriptionOptions extends DoubaoRealtimeSpeechExtraOptions {
  baseURL?: string | URL
  file?: Blob
  fileName?: string
  inputStream?: ReadableStream<AudioChunk>
  apiKey?: string
  appId?: string
  appKey?: string
  resourceId?: string
  model?: string
}

function resolveAudioStream(options: DoubaoRealtimeTranscriptionOptions): ReadableStream<AudioChunk> {
  const stream = options.inputAudioStream ?? options.inputStream ?? options.file?.stream()
  if (!stream)
    throw new TypeError('Audio stream or file is required for Doubao realtime transcription.')

  return stream as ReadableStream<AudioChunk>
}

function toArrayBuffer(chunk: AudioChunk): ArrayBuffer {
  if (chunk instanceof ArrayBuffer)
    return chunk

  if (ArrayBuffer.isView(chunk)) {
    if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength)
      return chunk.buffer as ArrayBuffer

    return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
  }

  throw new TypeError('Unsupported audio chunk type for Doubao realtime transcription.')
}

function resolveProxyUrl(baseURL: DoubaoRealtimeTranscriptionOptions['baseURL']) {
  const raw = baseURL instanceof URL
    ? baseURL.toString()
    : typeof baseURL === 'string' && baseURL.trim()
      ? baseURL.trim()
      : DEFAULT_DOUBAO_REALTIME_PROXY_PATH

  const resolved = raw.startsWith('ws://') || raw.startsWith('wss://')
    ? new URL(raw)
    : new URL(raw, resolveBaseOrigin())

  if (resolved.protocol === 'http:')
    resolved.protocol = 'ws:'
  else if (resolved.protocol === 'https:')
    resolved.protocol = 'wss:'

  return resolved
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function extractStrings(value: unknown, output: string[]) {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized)
      output.push(normalized)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value)
      extractStrings(item, output)
    return
  }

  if (!value || typeof value !== 'object')
    return

  const record = value as Record<string, unknown>
  for (const key of ['text', 'transcript', 'utterance', 'sentence', 'content', 'message']) {
    extractStrings(record[key], output)
  }

  for (const key of ['result', 'results', 'utterances', 'sentences', 'alternatives', 'chunks', 'paragraphs', 'payload']) {
    extractStrings(record[key], output)
  }
}

function extractTranscriptText(message: Extract<DoubaoRealtimeBrowserMessage, { type: 'asr-response' | 'asr-info' }>) {
  const strings: string[] = []
  extractStrings((message as { results?: unknown[] }).results, strings)
  extractStrings(message.payload, strings)

  const deduped: string[] = []
  for (const value of strings) {
    if (!deduped.includes(value))
      deduped.push(value)
  }

  return deduped.join('\n').trim()
}

function emitTextDelta(
  nextText: string,
  state: { fullText: string },
  textStreamCtrl?: ReadableStreamDefaultController<string>,
  fullStreamCtrl?: ReadableStreamDefaultController<StreamTranscriptionDelta>,
) {
  if (!nextText || nextText === state.fullText)
    return

  const delta = nextText.startsWith(state.fullText)
    ? nextText.slice(state.fullText.length)
    : nextText

  state.fullText = nextText

  if (!delta)
    return

  textStreamCtrl?.enqueue(delta)
  fullStreamCtrl?.enqueue({
    delta,
    type: 'transcript.text.delta',
  })
}

export function streamDoubaoRealtimeTranscription(options: DoubaoRealtimeTranscriptionOptions): StreamTranscriptionResult {
  const audioStream = resolveAudioStream(options)
  const deferredText = createDeferred<string>()

  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined
  let socket: WebSocket | undefined
  let closed = false
  const state = { fullText: '' }

  const fullStream = new ReadableStream<StreamTranscriptionDelta>({
    start(controller) {
      fullStreamCtrl = controller
    },
    cancel() {
      if (socket && socket.readyState === WebSocket.OPEN)
        socket.close(1000, 'stream cancelled')
    },
  })

  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamCtrl = controller
    },
    cancel() {
      if (socket && socket.readyState === WebSocket.OPEN)
        socket.close(1000, 'stream cancelled')
    },
  })

  function fail(error: unknown) {
    if (closed)
      return
    closed = true
    fullStreamCtrl?.error(error)
    textStreamCtrl?.error(error)
    deferredText.reject(error)
    if (socket && socket.readyState < WebSocket.CLOSING)
      socket.close(1011, 'stream failed')
  }

  function finish() {
    if (closed)
      return
    closed = true
    fullStreamCtrl?.enqueue({ delta: '', type: 'transcript.text.done' })
    fullStreamCtrl?.close()
    textStreamCtrl?.close()
    deferredText.resolve(state.fullText)
    if (socket && socket.readyState < WebSocket.CLOSING)
      socket.close(1000, 'transcription completed')
  }

  void (async () => {
    const reader = audioStream.getReader()

    try {
      if (!options.proxyAuth) {
        await bootstrapPepTutorBackendAuth().catch(() => undefined)
      }

      const proxyUrl = appendPepTutorBackendAuthQuery(
        resolveProxyUrl(options.baseURL),
        options.proxyAuth || resolvePepTutorBackendAuth(),
      )
      socket = new WebSocket(proxyUrl)
      socket.binaryType = 'arraybuffer'

      const startReady = createDeferred<void>()

      socket.onopen = () => {
        socket?.send(JSON.stringify({
          type: 'start',
          apiKey: options.apiKey,
          appId: options.appId,
          appKey: options.appKey || DEFAULT_DOUBAO_REALTIME_APP_KEY,
          resourceId: options.resourceId || DEFAULT_DOUBAO_REALTIME_RESOURCE_ID,
          model: options.model || DEFAULT_DOUBAO_REALTIME_MODEL,
          asr: options.asr,
          dialog: options.dialog,
        }))
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as DoubaoRealtimeBrowserMessage

          switch (message.type) {
            case 'ready':
              startReady.resolve()
              break
            case 'asr-info': {
              const previewText = extractTranscriptText(message)
              if (previewText && !state.fullText) {
                fullStreamCtrl?.enqueue({
                  delta: previewText,
                  type: 'transcript.text.delta',
                })
              }
              break
            }
            case 'asr-response':
              emitTextDelta(extractTranscriptText(message), state, textStreamCtrl, fullStreamCtrl)
              break
            case 'asr-ended':
              finish()
              break
            case 'error':
              fail(new Error(message.error || 'Doubao realtime ASR failed.'))
              break
            default:
              break
          }
        }
        catch (error) {
          fail(error)
        }
      }

      socket.onerror = () => {
        fail(new Error('Doubao realtime ASR websocket failed.'))
      }

      socket.onclose = (event) => {
        if (closed)
          return

        if (event.code === 1000)
          finish()
        else
          fail(new Error(event.reason || `Doubao realtime ASR websocket closed with code ${event.code}.`))
      }

      if (options.abortSignal) {
        if (options.abortSignal.aborted)
          throw options.abortSignal.reason ?? new DOMException('Aborted', 'AbortError')

        options.abortSignal.addEventListener('abort', () => {
          if (closed)
            return

          try {
            if (socket?.readyState === WebSocket.OPEN)
              socket.send(JSON.stringify({ type: 'end_asr' }))
          }
          catch {
          }

          fail(options.abortSignal?.reason ?? new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      }

      await startReady.promise

      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        if (!value)
          continue

        socket.send(toArrayBuffer(value))
      }

      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'end_asr' }))
    }
    catch (error) {
      fail(error)
    }
    finally {
      reader.releaseLock()
    }
  })()

  return {
    fullStream,
    text: deferredText.promise,
    textStream,
  }
}
