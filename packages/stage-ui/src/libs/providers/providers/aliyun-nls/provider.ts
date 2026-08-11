import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { EventStartTranscription, ServerEvent, ServerEvents } from './session'

import { tryCatch } from '@moeru/std'
import { timeout as promiseTimeout } from 'es-toolkit/promise'

import { createAliyunNLSSession } from './session'
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

const DEFAULT_SESSION_OPTIONS: EventStartTranscription['payload'] = {
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

function encodeSSE(payload: { delta: string, type: 'transcript.text.delta' | 'transcript.text.done' }): Uint8Array {
  return sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
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
  let cleanupPromise: Promise<void> | undefined

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

  function cleanup(error?: unknown, options?: { sendStop?: boolean, closeSocket?: boolean }) {
    if (cleanupPromise)
      return cleanupPromise

    cleanupPromise = (async () => {
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
    })()

    return cleanupPromise
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

      // The VAD-owned audio stream closes only after speech is complete. End
      // NLS immediately so it returns its final sentence before the next VAD segment.
      await requestStop()
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
                onSessionTerminated: async (sessionError) => {
                  controllerClosed = true
                  try {
                    await extraOptions?.onSessionTerminated?.(sessionError)
                    if (sessionError) {
                      controller.error(sessionError instanceof Error ? sessionError : new Error(String(sessionError)))
                      return
                    }

                    controller.enqueue(encodeSSE({ delta: '', type: 'transcript.text.done' }))
                    controller.close()
                  }
                  catch (error) {
                    console.error('error in onSessionTerminated hook:', error)
                    controller.error(error instanceof Error ? error : new Error(String(error)))
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
