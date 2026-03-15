import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { CommonRequestOptions } from '@xsai/shared'
import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

import type { EventStartTranscription, ServerEvent, ServerEvents } from './'

import { tryCatch } from '@moeru/std'
import { timeout as promiseTimeout } from 'es-toolkit/promise'

import { createAliyunNLSSession } from './'
import { nlsWebSocketEndpointFromRegion } from './utils'

type SessionOptions = NonNullable<Parameters<typeof createAliyunNLSSession>[3]>
type AudioChunk = ArrayBuffer | ArrayBufferView

function eventListenerOf(type: string, listener: EventListenerOrEventListenerObject, on?: EventTarget, options?: AddEventListenerOptions) {
  return {
    on: () => on?.addEventListener(type, listener, options),
    off: () => on?.removeEventListener(type, listener, options),
  }
}

function promiseOfAbortSignal(signal?: AbortSignal) {
  if (!signal)
    return null
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))

  return new Promise<never>((_, reject) => {
    const handler = () => {
      signal.removeEventListener('abort', handler)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }

    signal.addEventListener('abort', handler, { once: true })
  })
}

function createWaiter(timeoutMs: number, abortSignal?: AbortSignal) {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const deferred = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })

  function wait() {
    return Promise.race([
      deferred,
      timeoutMs > 0 ? promiseTimeout(timeoutMs) : deferred,
      abortSignal ? promiseOfAbortSignal(abortSignal) : deferred,
    ]) as Promise<void>
  }

  return {
    wait,
    trigger: () => resolve?.(),
    cancel: (reason?: unknown) => reject?.(reason),
  }
}

const DEFAULT_SESSION_OPTIONS: Pick<EventStartTranscription['payload'], 'format' | 'sample_rate'> = {
  format: 'pcm',
  sample_rate: 16000,
}

export interface AliyunRealtimeSpeechExtraOptions {
  region?: SessionOptions['region']
  abortSignal?: AbortSignal
  sessionOptions?: EventStartTranscription['payload']
  inputAudioStream?: ReadableStream<AudioChunk>
  hooks?: {
    onWebSocketConnecting?: () => Promise<void> | void
    onWebSocketOpen?: () => Promise<void> | void
    onWebSocketClose?: (code: number, reason: string) => Promise<void> | void
    onWebSocketError?: (event: Event) => Promise<void> | void
    onServerEvent?: (event: ServerEvent) => Promise<void> | void
  }
  onSessionTerminated?: (error?: unknown) => Promise<void> | void
}

export interface CreateAliyunStreamTranscriptionOptions extends AliyunRealtimeSpeechExtraOptions {
  accessKeyId: string
  accessKeySecret: string
  appKey: string
  audioStream: ReadableStream<AudioChunk>
}

export interface AliyunStreamTranscriptionHandle {
  close: () => Promise<void>
}

interface AliyunStreamTranscriptionOptions extends AliyunRealtimeSpeechExtraOptions {
  baseURL?: CommonRequestOptions['baseURL']
  fetch?: CommonRequestOptions['fetch']
  headers?: HeadersInit
  file?: Blob
  fileName?: string
  inputStream?: ReadableStream<AudioChunk>
}

function toArrayBuffer(chunk: AudioChunk): ArrayBuffer {
  if (chunk instanceof ArrayBuffer)
    return chunk

  if (ArrayBuffer.isView(chunk)) {
    if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength)
      return chunk.buffer as ArrayBuffer

    return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
  }

  throw new TypeError('Unsupported audio chunk type for Aliyun streaming transcription')
}

const sseEncoder = new TextEncoder()

function encodeSSE(payload: StreamTranscriptionDelta): Uint8Array {
  return sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

// NOTICE: Copied/adapted from @xsai/stream-transcription SSE parsing to keep behavior consistent.
// Ref: @xsai/stream-transcription@0.4.0-beta.8 (dist/index.js parseChunk/transformChunk).
function parseSSELine(line: string): StreamTranscriptionDelta | undefined {
  if (!line || !line.startsWith('data:'))
    return undefined

  const content = line.slice('data:'.length)
  const data = content.startsWith(' ') ? content.slice(1) : content
  if (!data)
    return undefined

  return JSON.parse(data) as StreamTranscriptionDelta
}

function aliyunChunkTransformer() {
  const decoder = new TextDecoder()
  let buffer = ''

  return new TransformStream<Uint8Array, StreamTranscriptionDelta>({
    transform: (chunk, controller) => {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const parsed = parseSSELine(line)
        if (parsed)
          controller.enqueue(parsed)
      }
    },
    flush: (controller) => {
      if (!buffer)
        return
      const parsed = parseSSELine(buffer)
      if (parsed)
        controller.enqueue(parsed)
    },
  })
}

// NOTICE: Copied/adapted from @xsai/stream-transcription delayed promise helper.
// Ref: @xsai/stream-transcription@0.4.0-beta.8 (dist/index.js DelayedPromise usage).
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function resolveAudioStream(options: AliyunStreamTranscriptionOptions): ReadableStream<AudioChunk> {
  const stream = options.inputAudioStream ?? options.inputStream ?? options.file?.stream()
  if (!stream)
    throw new TypeError('Audio stream or file is required for Aliyun streaming transcription.')

  return stream as ReadableStream<AudioChunk>
}

interface InternalRealtimeOptions extends CreateAliyunStreamTranscriptionOptions {
  onSentenceFinal?: (payload: ServerEvents['SentenceEnd']) => Promise<void> | void
  idleTimeoutMs?: number
  stopAckTimeoutMs?: number
}

async function startRealtimeSession(options: InternalRealtimeOptions): Promise<AliyunStreamTranscriptionHandle> {
  const {
    accessKeyId,
    accessKeySecret,
    appKey,
    region,
    sessionOptions,
    audioStream,
    abortSignal,
    hooks,
    onSessionTerminated,
    onSentenceFinal,
    idleTimeoutMs = 8000,
    stopAckTimeoutMs = 2000,
  } = options

  const session = createAliyunNLSSession(accessKeyId, accessKeySecret, appKey, { region })
  const reader = audioStream.getReader()
  const url = await session.websocketUrl()

  await tryCatch(() => hooks?.onWebSocketConnecting?.())

  const websocket = new WebSocket(url)
  websocket.binaryType = 'arraybuffer'

  const abortHandler = abortSignal
    ? eventListenerOf('abort', () => cleanup(abortSignal.reason ?? new DOMException('Aborted', 'AbortError')), abortSignal, { once: true })
    : undefined

  abortHandler?.on()

  const stopWaiter = createWaiter(stopAckTimeoutMs, abortSignal)
  let stopping = false

  async function requestStop(reason?: unknown) {
    if (stopping)
      return
    stopping = true
    try {
      if (websocket?.readyState === WebSocket.OPEN)
        await tryCatch(() => session.stop(websocket))

      await Promise.race([
        stopWaiter.wait(),
        new Promise(resolve => setTimeout(resolve, stopAckTimeoutMs)),
      ])
    }
    catch (error) {
      await cleanup(error, { sendStop: false })
      return
    }

    await cleanup(reason, { sendStop: false })
  }

  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const bumpIdle = () => {
    if (idleTimer)
      clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      void requestStop(new DOMException('Idle timeout', 'AbortError'))
    }, idleTimeoutMs)
  }

  bumpIdle()

  async function cleanup(error?: unknown, options?: { sendStop?: boolean, closeSocket?: boolean }) {
    const { sendStop = true, closeSocket = true } = options ?? {}
    abortHandler?.off()
    await tryCatch(async () => await reader.cancel())

    if (websocket && closeSocket) {
      switch (websocket.readyState) {
        case WebSocket.OPEN:
          if (sendStop)
            await tryCatch(() => session.stop(websocket))
          websocket.close(1000, 'client closed')
          break
        case WebSocket.CONNECTING:
          websocket.close(1000, 'client closed')
          break
        default:
          // If the server has already initiated closure, avoid sending another close frame.
          break
      }
    }

    await onSessionTerminated?.(error)
  }

  const handle: AliyunStreamTranscriptionHandle = {
    close: async () => await cleanup(new DOMException('Closed', 'AbortError')),
  }

  async function onTranscriptionStarted() {
    try {
      while (true) {
        if (abortSignal?.aborted) {
          break
        }

        const { done, value } = await reader.read()
        if (done)
          break
        if (value)
          websocket!.send(toArrayBuffer(value))

        bumpIdle()
      }

      // Allow a grace period for server to flush final events before stop.
      bumpIdle()
    }
    catch (error) {
      await cleanup(error)
    }
  }

  async function onMessage(message: MessageEvent) {
    const data = JSON.parse(message.data)
    session.onEvent(data, async (event: ServerEvent) => {
      await tryCatch(async () => await hooks?.onServerEvent?.(event))

      bumpIdle()

      try {
        switch (event.header.name) {
          case 'TranscriptionStarted':
            onTranscriptionStarted()
            break
          case 'SentenceEnd':
            await onSentenceFinal?.(event.payload as ServerEvents['SentenceEnd'])
            break
          case 'TranscriptionCompleted':
            stopWaiter.trigger()
            await cleanup(undefined, { sendStop: false, closeSocket: false })
            break
          default:
            break
        }
      }
      catch (error) {
        await cleanup(error)
      }
    })
  }

  async function onOpen() {
    await tryCatch(() => hooks?.onWebSocketOpen?.())

    session.start(websocket!, {
      enable_intermediate_result: true,
      enable_punctuation_prediction: true,
      ...DEFAULT_SESSION_OPTIONS,
      ...sessionOptions,
    })
  }

  websocket.onerror = event => tryCatch(() => hooks?.onWebSocketError?.(event))
  websocket.onclose = (close) => {
    stopWaiter.trigger()
    return tryCatch(() => hooks?.onWebSocketClose?.(close?.code ?? 1006, close?.reason ?? ''))
  }
  websocket.onopen = () => tryCatch(async () => onOpen())
  websocket.onmessage = event => tryCatch(async () => onMessage(event))

  if (abortSignal?.aborted)
    throw abortSignal.reason ?? new DOMException('Aborted', 'AbortError')

  return handle
}

export function streamAliyunTranscription(options: AliyunStreamTranscriptionOptions): StreamTranscriptionResult {
  const audioStream = resolveAudioStream(options)
  const fetcher = options.fetch ?? globalThis.fetch
  const deferredText = createDeferred<string>()

  let text = ''
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined

  const fullStream = new ReadableStream<StreamTranscriptionDelta>({
    start(controller) {
      fullStreamCtrl = controller
    },
  })

  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamCtrl = controller
    },
  })

  const doStream = async () => {
    const requestTarget = options.baseURL instanceof URL
      ? options.baseURL
      : new URL(typeof options.baseURL === 'string' ? options.baseURL : 'http://localhost')
    const response = await fetcher(requestTarget, {
      body: audioStream,
      headers: options.headers,
      method: 'POST',
      signal: options.abortSignal,
    })

    if (!response.ok)
      throw new Error(`Aliyun streaming transcription request failed with status ${response.status}`)

    if (!response.body)
      throw new Error('Streaming transcription response is missing a readable body.')

    await response.body
      .pipeThrough(aliyunChunkTransformer())
      .pipeTo(new WritableStream<StreamTranscriptionDelta>({
        write: (chunk) => {
          fullStreamCtrl?.enqueue(chunk)
          if (chunk.type === 'transcript.text.delta') {
            text += chunk.delta
            textStreamCtrl?.enqueue(chunk.delta)
          }
        },
        close: () => {
          fullStreamCtrl?.close()
          textStreamCtrl?.close()
        },
        abort: (reason) => {
          fullStreamCtrl?.error(reason)
          textStreamCtrl?.error(reason)
        },
      }))
  }

  void (async () => {
    try {
      await doStream()
      deferredText.resolve(text)
    }
    catch (error) {
      fullStreamCtrl?.error(error)
      textStreamCtrl?.error(error)
      deferredText.reject(error)
    }
  })()

  // REVIEW: We mirrored the streaming orchestration from @xsai/stream-transcription instead of
  // patching the upstream package because Aliyun uses a custom websocket+fetch bridge (no FormData).
  // Keeping it local avoids diverging from the published package while we wait for upstream support.
  return {
    fullStream,
    text: deferredText.promise,
    textStream,
  }
}

export function createAliyunNLSProvider(
  accessKeyId: string,
  accessKeySecret: string,
  appKey: string,
  options?: {
    region?: SessionOptions['region']
  },
): SpeechProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions> & { dispose: () => Promise<void> } {
  return {
    speech(_, extraOptions) {
      return {
        baseURL: nlsWebSocketEndpointFromRegion(extraOptions?.region ?? options?.region),
        model: 'aliyun-nls-v1',
        fetch: async (_request: RequestInfo | URL, init?: RequestInit) => {
          const streamSource = (init?.body ?? extraOptions?.inputAudioStream)
          if (!(streamSource instanceof ReadableStream))
            throw new TypeError('Audio stream must be provided as a ReadableStream for Aliyun NLS streaming transcription.')

          let sessionHandle: AliyunStreamTranscriptionHandle | undefined
          let controllerClosed = false

          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              startRealtimeSession({
                accessKeyId,
                accessKeySecret,
                appKey,
                region: extraOptions?.region ?? options?.region,
                sessionOptions: extraOptions?.sessionOptions,
                audioStream: streamSource as ReadableStream<AudioChunk>,
                abortSignal: extraOptions?.abortSignal || init?.signal || undefined,
                hooks: extraOptions?.hooks,
                onSessionTerminated: async (error) => {
                  controllerClosed = true
                  try {
                    await extraOptions?.onSessionTerminated?.(error)
                    controller.enqueue(encodeSSE({ delta: '', type: 'transcript.text.done' }))
                  }
                  finally {
                    if (error)
                      controller.error(error instanceof Error ? error : new Error(String(error)))
                    else
                      controller.close()
                  }
                },
                onSentenceFinal: async (payload) => {
                  const text = payload.result ? `${payload.result}\n` : ''
                  if (text)
                    controller.enqueue(encodeSSE({ delta: text, type: 'transcript.text.delta' }))

                  controller.enqueue(encodeSSE({ delta: '', type: 'transcript.text.done' }))
                },
              }).then((handle) => {
                sessionHandle = handle
              }).catch(async (error) => {
                controllerClosed = true
                try {
                  await extraOptions?.onSessionTerminated?.(error)
                }
                finally {
                  controller.error(error instanceof Error ? error : new Error(String(error)))
                }
              })
            },
            cancel: async () => {
              if (!controllerClosed)
                await sessionHandle?.close()
            },
          })

          return new Response(stream, {
            headers: {
              'Cache-Control': 'no-cache',
              'Content-Type': 'text/event-stream',
            },
          })
        },
      }
    },
    // Allow external caches to dispose provider instances; no persistent resources to release here.
    async dispose() {

    },
  }
}
