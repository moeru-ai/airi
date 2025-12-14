import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { StreamTranscriptionDelta } from '@xsai/stream-transcription'

import type { EventStartTranscription, ServerEvent, ServerEvents } from './'

import { createAliyunNLSSession } from './'
import { nlsWebSocketEndpointFromRegion } from './utils'

type SessionOptions = NonNullable<Parameters<typeof createAliyunNLSSession>[3]>
type AudioChunk = ArrayBuffer | ArrayBufferView

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

interface InternalRealtimeOptions extends CreateAliyunStreamTranscriptionOptions {
  onSentenceFinal?: (payload: ServerEvents['SentenceEnd']) => Promise<void> | void
}

function mayThrow(fn: () => void | Promise<void>) {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}

function eventListenerOf(type: string, listener: EventListenerOrEventListenerObject, on?: EventTarget) {
  return {
    on: () => on?.addEventListener(type, listener),
    off: () => on?.removeEventListener(type, listener),
  }
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
  } = options

  const session = createAliyunNLSSession(accessKeyId, accessKeySecret, appKey, { region })
  const reader = audioStream.getReader()
  const url = await session.websocketUrl()

  mayThrow(() => hooks?.onWebSocketConnecting?.())

  const websocket = new WebSocket(url)
  websocket.binaryType = 'arraybuffer'

  const abortHandler = abortSignal
    ? eventListenerOf('abort', () => cleanup(abortSignal?.reason ?? new DOMException('Aborted', 'AbortError')), abortSignal)
    : undefined
  abortHandler?.on()

  async function cleanup(error?: unknown) {
    abortHandler?.off()
    mayThrow(async () => await reader.cancel())

    if (websocket) {
      if (websocket.readyState === WebSocket.OPEN) {
        mayThrow(() => session.stop(websocket))
        websocket.close(1000, 'client closed')
      }
      else {
        mayThrow(() => websocket?.close())
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
      }
    }
    catch (error) {
      await cleanup(error)
    }
  }

  async function onMessage(message: MessageEvent) {
    const data = JSON.parse(message.data)
    session.onEvent(data, async (event: ServerEvent) => {
      mayThrow(async () => await hooks?.onServerEvent?.(event))

      try {
        switch (event.header.name) {
          case 'TranscriptionStarted':
            onTranscriptionStarted()
            break
          case 'SentenceEnd':
            await onSentenceFinal?.(event.payload as ServerEvents['SentenceEnd'])
            break
          case 'TranscriptionCompleted':
            await cleanup()
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
    mayThrow(() => hooks?.onWebSocketOpen?.())

    session.start(websocket!, {
      enable_intermediate_result: true,
      enable_punctuation_prediction: true,
      ...DEFAULT_SESSION_OPTIONS,
      ...sessionOptions,
    })
  }

  websocket.onerror = event => mayThrow(() => hooks?.onWebSocketError?.(event))
  websocket.onclose = close => mayThrow(() => hooks?.onWebSocketClose?.(close?.code ?? 1006, close?.reason ?? ''))
  websocket.onopen = () => mayThrow(async () => onOpen())
  websocket.onmessage = event => mayThrow(async () => onMessage(event))

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
): SpeechProviderWithExtraOptions<string, AliyunRealtimeSpeechExtraOptions> {
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
  }
}
