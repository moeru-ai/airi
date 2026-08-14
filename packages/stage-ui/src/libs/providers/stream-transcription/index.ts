import type { CommonRequestOptions } from '@xsai/shared'
import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

type AudioChunk = ArrayBuffer | ArrayBufferView

/** A complete transcript snapshot that replaces earlier volatile text. */
export interface StreamTranscriptionSnapshot {
  durationMilliseconds: number
  isFinal: boolean
  locale: string
  startMilliseconds: number
  text: string
  type: 'transcript.text.snapshot'
}

export type AIRIStreamTranscriptionDelta = StreamTranscriptionDelta | StreamTranscriptionSnapshot

/** xsAI stream result with AIRI's replaceable snapshot event. */
export interface AIRIStreamTranscriptionResult extends Omit<StreamTranscriptionResult, 'fullStream'> {
  fullStream: ReadableStream<AIRIStreamTranscriptionDelta>
}

/** Options for adapting an SSE transcription request to xsAI stream results. */
export interface StreamTranscriptionOptions {
  abortSignal?: AbortSignal
  baseURL?: CommonRequestOptions['baseURL']
  fetch?: CommonRequestOptions['fetch']
  headers?: HeadersInit
  file?: Blob
  inputAudioStream?: ReadableStream<AudioChunk>
  inputStream?: ReadableStream<AudioChunk>
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

function resolveAudioStream(options: StreamTranscriptionOptions): ReadableStream<AudioChunk> {
  const stream = options.inputAudioStream ?? options.inputStream ?? options.file?.stream()
  if (!stream)
    throw new TypeError('Audio stream or file is required for streaming transcription.')

  return stream as ReadableStream<AudioChunk>
}

function parseSSELine(line: string): AIRIStreamTranscriptionDelta | undefined {
  if (!line || !line.startsWith('data:'))
    return undefined

  const content = line.slice('data:'.length)
  const data = content.startsWith(' ') ? content.slice(1) : content
  if (!data)
    return undefined

  return JSON.parse(data) as AIRIStreamTranscriptionDelta
}

function createSSETransformer() {
  const decoder = new TextDecoder()
  let buffer = ''

  return new TransformStream<Uint8Array, AIRIStreamTranscriptionDelta>({
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

/**
 * Converts an SSE transcription endpoint into xsAI's streaming result shape.
 *
 * The provider owns transport details. This adapter owns only request input,
 * SSE parsing, and the result streams consumed by Hearing.
 */
export function streamTranscription(options: StreamTranscriptionOptions): AIRIStreamTranscriptionResult {
  const audioStream = resolveAudioStream(options)
  const fetcher = options.fetch ?? globalThis.fetch
  const deferredText = createDeferred<string>()

  let text = ''
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<AIRIStreamTranscriptionDelta> | undefined

  const fullStream = new ReadableStream<AIRIStreamTranscriptionDelta>({
    start(controller) {
      fullStreamCtrl = controller
    },
  })

  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamCtrl = controller
    },
  })

  void (async () => {
    try {
      const requestTarget = options.baseURL instanceof URL
        ? options.baseURL
        : new URL(typeof options.baseURL === 'string' ? options.baseURL : 'http://localhost')
      const response = await fetcher(requestTarget, {
        body: audioStream,
        // Browser fetch requires half-duplex mode for a ReadableStream body.
        // Keep this at the transport boundary so every SSE transcription
        // provider receives the required request option.
        duplex: 'half',
        headers: options.headers,
        method: 'POST',
        signal: options.abortSignal,
      } as RequestInit & { duplex: 'half' })

      if (!response.ok)
        throw new Error(`Streaming transcription request failed with status ${response.status}`)

      if (!response.body)
        throw new Error('Streaming transcription response is missing a readable body.')

      await response.body
        .pipeThrough(createSSETransformer())
        .pipeTo(new WritableStream<AIRIStreamTranscriptionDelta>({
          write: (chunk) => {
            fullStreamCtrl?.enqueue(chunk)
            if (chunk.type === 'transcript.text.delta') {
              text += chunk.delta
              textStreamCtrl?.enqueue(chunk.delta)
            }
            else if (chunk.type === 'transcript.text.snapshot') {
              text = chunk.text
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
      deferredText.resolve(text)
    }
    catch (error) {
      fullStreamCtrl?.error(error)
      textStreamCtrl?.error(error)
      deferredText.reject(error)
    }
  })()

  return {
    fullStream,
    text: deferredText.promise,
    textStream,
  }
}
