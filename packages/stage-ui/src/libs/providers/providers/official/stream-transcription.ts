import type { AudioTranscriptionClientControlMessage, AudioTranscriptionServerMessage } from '@proj-airi/server-sdk-shared'

import type { AIRIStreamTranscriptionDelta, AIRIStreamTranscriptionResult, StreamTranscriptionOptions } from '../../stream-transcription'

import { getAuthToken } from '../../../auth'

interface OfficialStreamTranscriptionOptions extends StreamTranscriptionOptions {
  model?: string
}

type AudioChunk = ArrayBuffer | ArrayBufferView

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

function resolveAudioStream(options: OfficialStreamTranscriptionOptions): ReadableStream<AudioChunk> {
  const stream = options.inputAudioStream ?? options.inputStream ?? options.file?.stream()
  if (!stream)
    throw new TypeError('Audio stream or file is required for official transcription.')
  return stream as ReadableStream<AudioChunk>
}

function toUint8Array(chunk: AudioChunk): Uint8Array {
  if (chunk instanceof ArrayBuffer)
    return new Uint8Array(chunk)
  return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

function toWebSocketURL(baseURL: URL | string, token: string): string {
  const url = new URL(baseURL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token)
  return url.toString()
}

/** Streams one VAD speech segment through the official ASR WebSocket. */
export function streamOfficialTranscription(options: OfficialStreamTranscriptionOptions): AIRIStreamTranscriptionResult {
  const audioStream = resolveAudioStream(options)
  const deferredText = createDeferred<string>()

  let text = ''
  let fullStreamController: ReadableStreamDefaultController<AIRIStreamTranscriptionDelta> | undefined
  let textStreamController: ReadableStreamDefaultController<string> | undefined
  let audioReader: ReadableStreamDefaultReader<AudioChunk> | undefined
  let socket: WebSocket | undefined
  let settled = false
  let sessionStarted = false
  let sessionFinished = false

  const fullStream = new ReadableStream<AIRIStreamTranscriptionDelta>({
    start(controller) {
      fullStreamController = controller
    },
  })
  const textStream = new ReadableStream<string>({
    start(controller) {
      textStreamController = controller
    },
  })

  function cleanup() {
    options.abortSignal?.removeEventListener('abort', handleAbort)
  }

  function closeSocket() {
    try {
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING)
        socket.close()
    }
    catch {}
  }

  function fail(error: unknown) {
    if (settled)
      return
    settled = true
    cleanup()
    void audioReader?.cancel(error).catch(() => {})
    fullStreamController?.error(error)
    textStreamController?.error(error)
    deferredText.reject(error)
    closeSocket()
  }

  function finish() {
    if (settled)
      return
    settled = true
    sessionFinished = true
    cleanup()
    fullStreamController?.close()
    textStreamController?.close()
    deferredText.resolve(text)
    closeSocket()
  }

  function handleAbort() {
    const reason = options.abortSignal?.reason ?? new DOMException('Aborted', 'AbortError')
    try {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ event: 'cancel' } satisfies AudioTranscriptionClientControlMessage))
    }
    catch {}
    fail(reason)
  }

  async function waitForSocketCapacity() {
    // A 256 KiB limit holds about eight seconds of 16 kHz mono PCM16 audio.
    // Stop reading the source stream while the browser drains its send buffer.
    while (true) {
      if (!socket || socket.bufferedAmount <= 256 * 1024)
        return
      if (options.abortSignal?.aborted)
        throw options.abortSignal.reason ?? new DOMException('Aborted', 'AbortError')
      if (socket.readyState !== WebSocket.OPEN)
        throw new Error('Official ASR WebSocket closed while it sent audio.')
      await new Promise(resolve => setTimeout(resolve, 4))
    }
  }

  async function sendAudio() {
    if (!socket || socket.readyState !== WebSocket.OPEN)
      throw new Error('Official ASR WebSocket is not open.')

    audioReader = audioStream.getReader()
    while (true) {
      const { done, value } = await audioReader.read()
      if (done)
        break
      await waitForSocketCapacity()
      socket.send(toUint8Array(value))
    }

    if (!settled && !options.abortSignal?.aborted)
      socket.send(JSON.stringify({ event: 'stop' } satisfies AudioTranscriptionClientControlMessage))
  }

  function handleServerMessage(raw: string) {
    let message: AudioTranscriptionServerMessage
    try {
      message = JSON.parse(raw) as AudioTranscriptionServerMessage
    }
    catch {
      fail(new Error('Official ASR returned an invalid JSON frame.'))
      return
    }

    switch (message.event) {
      case 'session.started':
        if (sessionStarted) {
          fail(new Error('Official ASR started the session more than once.'))
          return
        }
        sessionStarted = true
        void sendAudio().catch(fail)
        break
      case 'transcript.text.delta': {
        const delta: AIRIStreamTranscriptionDelta = {
          type: 'transcript.text.delta',
          delta: message.delta,
        }
        text += message.delta
        fullStreamController?.enqueue(delta)
        textStreamController?.enqueue(message.delta)
        break
      }
      case 'transcript.text.done':
        fullStreamController?.enqueue({ type: 'transcript.text.done', delta: '' })
        break
      case 'session.finished':
        finish()
        break
      case 'error':
        fail(new Error(`${message.code}: ${message.message}`))
        break
    }
  }

  queueMicrotask(() => {
    try {
      const token = getAuthToken()
      if (!token) {
        fail(new Error('Official ASR requires authentication.'))
        return
      }
      if (!options.baseURL) {
        fail(new Error('Official ASR WebSocket URL is missing.'))
        return
      }
      if (options.abortSignal?.aborted) {
        handleAbort()
        return
      }

      options.abortSignal?.addEventListener('abort', handleAbort, { once: true })
      socket = new WebSocket(toWebSocketURL(options.baseURL, token))
      socket.binaryType = 'arraybuffer'
      socket.addEventListener('open', () => {
        socket?.send(JSON.stringify({
          event: 'start',
          model: 'auto',
          format: 'pcm',
          sample_rate: 16000,
        } satisfies AudioTranscriptionClientControlMessage))
      })
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          fail(new Error('Official ASR returned an unexpected binary frame.'))
          return
        }
        handleServerMessage(event.data)
      })
      socket.addEventListener('error', () => {
        // The browser exposes the close code and reason on the following event.
      })
      socket.addEventListener('close', (event) => {
        if (settled || sessionFinished)
          return
        const reason = event.reason || `closed_${event.code}`
        fail(new Error(`Official ASR WebSocket closed before session.finished: ${reason}`))
      })
    }
    catch (error) {
      fail(error)
    }
  })

  return {
    fullStream,
    text: deferredText.promise,
    textStream,
  }
}
