import type { CommonRequestOptions, WithUnknown } from '@xsai/shared'

import { DelayedPromise, requestHeaders, requestURL, responseCatch } from '@xsai/shared'

/** @internal */
function parseChunk(text: string): [StreamTranscriptionDelta | undefined, boolean] {
  if (!text || !text.startsWith('data:'))
    return [undefined, false]

  // Extract content after "data:" prefix
  const content = text.slice('data:'.length) // Remove leading single space if present
  const data = content.startsWith(' ') ? content.slice(1) : content
  // Handle special cases
  if (data.includes('[DONE]')) {
    return [undefined, true]
  }

  if (data.startsWith('{') && data.includes('"error":')) {
    throw new Error(`Error from server: ${data}`)
  }

  // Process normal chunk
  const chunk = JSON.parse(data) as StreamTranscriptionDelta

  return [chunk, false]
}

/** @internal */
export function transformChunk() {
  const decoder = new TextDecoder()
  let buffer = ''

  return new TransformStream<Uint8Array, StreamTranscriptionDelta>({
    transform: async (chunk, controller) => {
      const text = decoder.decode(chunk, { stream: true })
      buffer += text
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      // Process complete lines
      for (const line of lines) {
        try {
          const [chunk, isEnd] = parseChunk(line)
          if (isEnd)
            break

          if (chunk) {
            controller.enqueue(chunk)
          }
        }
        catch (error) {
          controller.error(error)
        }
      }
    },
  })
}

export interface StreamTranscriptionDelta {
  delta: string
  type: StreamTranscriptionDeltaType
}

export type StreamTranscriptionDeltaType = 'transcript.text.delta' | 'transcript.text.done'

export interface StreamTranscriptionBaseOptions extends CommonRequestOptions {
  language?: string
  prompt?: string
  responseFormat?: never
  /**
   * If you want to disable stream, use `@xsai/generate-transcription`.
   */
  stream?: never
  temperature?: string
  timestampGranularities?: never
}

export interface StreamTranscriptionFileInputOptions extends StreamTranscriptionBaseOptions {
  file: Blob
  fileName?: string
}

export interface StreamTranscriptionStreamInputOptions extends StreamTranscriptionBaseOptions {
  inputAudioStream: ReadableStream<ArrayBuffer>
}

export interface StreamTranscriptionResult {
  fullStream: ReadableStream<StreamTranscriptionDelta>
  text: Promise<string>
  textStream: ReadableStream<string>
}

function isFileInputOptions(
  options: StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions,
): options is StreamTranscriptionFileInputOptions {
  return 'file' in options
}

/** @experimental */
export function streamTranscription(options: WithUnknown<StreamTranscriptionFileInputOptions> | WithUnknown<StreamTranscriptionStreamInputOptions>): StreamTranscriptionResult {
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined
  const fullStream = new ReadableStream<StreamTranscriptionDelta>({ start: controller => fullStreamCtrl = controller })
  const textStream = new ReadableStream<string>({ start: controller => textStreamCtrl = controller })
  const fullText = new DelayedPromise<string>()
  let text = ''

  const doStream = async () => {
    const opts = options as StreamTranscriptionFileInputOptions | StreamTranscriptionStreamInputOptions
    let body: FormData | ReadableStream

    if (isFileInputOptions(opts)) {
      // Build FormData for file upload
      body = new FormData()
      body.append('model', options.model)
      body.append('file', options.file as Blob, options.fileName as string)
      body.append('stream', 'true')

      if (options.language != null)
        body.append('language', options.language)

      if (options.prompt != null)
        body.append('prompt', options.prompt)

      if (options.temperature != null)
        body.append('temperature', options.temperature)
    }
    else {
      body = opts.inputAudioStream
    }

    const response = await (options.fetch ?? globalThis.fetch)(requestURL('audio/transcriptions', options.baseURL), {
      body,
      headers: requestHeaders(options.headers, options.apiKey),
      method: 'POST',
      signal: options.abortSignal,
    })

    // Check response status before processing
    await responseCatch(response)

    const { body: stream } = response

    await stream!
      .pipeThrough(transformChunk())
      .pipeTo(new WritableStream({
        abort: (reason) => {
          fullStreamCtrl?.error(reason)
          textStreamCtrl?.error(reason)
        },
        close: () => {},
        write: (chunk) => {
          if (chunk.type === 'transcript.text.delta') {
            textStreamCtrl?.enqueue(chunk.delta)
            text += chunk.delta
            fullStreamCtrl?.enqueue(chunk)
          }
          else if (chunk.type === 'transcript.text.done') {
            // TODO: handle usage
          }
        },
      }))
  }

  void (async () => {
    try {
      await doStream()
      fullText.resolve(text)
      fullStreamCtrl?.close()
      textStreamCtrl?.close()
    }
    catch (err) {
      fullStreamCtrl?.error(err)
      textStreamCtrl?.error(err)
      fullText.reject(err)
    }
  })()
  return {
    fullStream,
    text: fullText.promise,
    textStream,
  }
}
