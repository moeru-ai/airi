import type {
  DoubaoSpeechRequest,
  DoubaoSpeechResponse,
  DoubaoSpeechSessionConfig,
} from '@proj-airi/stage-shared/doubao-speech'

import type { StreamingTtsWebSocket } from '../../../speech/streaming-pipeline'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { doubaoSpeechStream } from '@proj-airi/stage-shared/doubao-speech'

interface StreamingSocketEventMap {
  close: CloseEvent
  error: Event
  message: MessageEvent<string | ArrayBuffer>
  open: Event
}

type StreamingSocketEvent = keyof StreamingSocketEventMap

interface PipelineCommand {
  event: 'cancel' | 'finish' | 'start' | 'text'
  text?: string
}

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3

function createRequestChannel() {
  let controller: ReadableStreamDefaultController<DoubaoSpeechRequest> | undefined
  const stream = new ReadableStream<DoubaoSpeechRequest>({
    start(value) {
      controller = value
    },
  })

  if (!controller)
    throw new Error('Could not create the Doubao speech request stream.')

  return { controller, stream }
}

function createInvocation(requests: ReadableStream<DoubaoSpeechRequest>, signal: AbortSignal) {
  if (typeof window === 'undefined' || !isElectronWindow(window))
    throw new Error('Doubao speech requires the Electron desktop app.')

  const eventa = createContext(window.electron.ipcRenderer)
  const invoke = defineStreamInvoke(eventa.context, doubaoSpeechStream)
  return {
    dispose: eventa.dispose,
    responses: invoke(requests, { signal }),
  }
}

function parsePipelineCommand(data: string): PipelineCommand {
  const value: unknown = JSON.parse(data)
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid Doubao speech pipeline command.')

  const event = Reflect.get(value, 'event')
  if (event !== 'start' && event !== 'text' && event !== 'finish' && event !== 'cancel')
    throw new TypeError('Unknown Doubao speech pipeline command.')

  const text = Reflect.get(value, 'text')
  if (event === 'text' && typeof text !== 'string')
    throw new TypeError('Doubao speech text commands require text.')

  return typeof text === 'string' ? { event, text } : { event }
}

function responseFrame(response: Exclude<DoubaoSpeechResponse, { type: 'audio' }>) {
  return JSON.stringify(response.payload
    ? { event: response.event, payload: response.payload }
    : { event: response.event })
}

function mergeAudioChunks(chunks: Uint8Array[]) {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const output = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

/**
 * Adapts one Eventa bidirectional invoke to the socket surface used by Stage.
 *
 * The renderer sends serializable commands through Electron IPC. The main
 * process owns the authenticated upstream WebSocket and returns audio chunks.
 */
class DoubaoSpeechEventaSocket implements StreamingTtsWebSocket {
  binaryType: BinaryType = 'arraybuffer'
  readyState = CONNECTING

  private readonly abortController = new AbortController()
  private readonly eventListeners: {
    [Key in StreamingSocketEvent]: Set<(event: StreamingSocketEventMap[Key]) => void>
  } = {
    close: new Set(),
    error: new Set(),
    message: new Set(),
    open: new Set(),
  }

  private readonly requestController: ReadableStreamDefaultController<DoubaoSpeechRequest>
  private readonly responses: ReadableStream<DoubaoSpeechResponse>
  private readonly disposeEventa: (reason?: unknown) => void
  private readonly pcmChunks: Uint8Array[] = []
  private requestClosed = false
  private sessionFinished = false
  private started = false

  constructor(private readonly config: DoubaoSpeechSessionConfig) {
    const requests = createRequestChannel()
    this.requestController = requests.controller

    const invocation = createInvocation(requests.stream, this.abortController.signal)
    this.disposeEventa = invocation.dispose
    this.responses = invocation.responses

    void this.pumpResponses()
    queueMicrotask(() => {
      if (this.readyState !== CONNECTING)
        return
      this.readyState = OPEN
      this.emit('open', new Event('open'))
    })
  }

  addEventListener<Key extends StreamingSocketEvent>(
    type: Key,
    listener: (event: StreamingSocketEventMap[Key]) => void,
  ) {
    this.eventListeners[type].add(listener)
  }

  send(data: string) {
    if (this.readyState !== OPEN)
      throw new Error('Doubao speech transport is not open.')
    if (this.requestClosed)
      throw new Error('Doubao speech input is already closed.')

    const command = parsePipelineCommand(data)
    switch (command.event) {
      case 'start':
        if (this.started)
          throw new TypeError('Doubao speech can start only once.')
        this.started = true
        this.requestController.enqueue({ type: 'start', config: this.config })
        break
      case 'text':
        if (!this.started)
          throw new TypeError('Doubao speech must start before text is sent.')
        this.requestController.enqueue({ type: 'text', text: command.text ?? '' })
        break
      case 'finish':
      case 'cancel':
        if (!this.started)
          throw new TypeError('Doubao speech must start before it can finish.')
        this.requestController.enqueue({ type: command.event })
        this.closeRequests()
        break
    }
  }

  close() {
    if (this.readyState === CLOSING || this.readyState === CLOSED)
      return

    this.readyState = CLOSING
    if (!this.requestClosed) {
      if (this.started)
        this.requestController.enqueue({ type: 'cancel' })
      this.closeRequests()
    }

    setTimeout(() => this.completeClose(1000, 'Client closed the speech session.', true), 0)
  }

  private closeRequests() {
    if (this.requestClosed)
      return
    this.requestClosed = true
    this.requestController.close()
  }

  private completeClose(code: number, reason: string, abortInvocation: boolean) {
    if (this.readyState === CLOSED)
      return

    this.readyState = CLOSED
    if (abortInvocation && !this.abortController.signal.aborted)
      this.abortController.abort(reason)
    this.disposeEventa(reason)
    this.emit('close', new CloseEvent('close', { code, reason }))
  }

  private emit<Key extends StreamingSocketEvent>(type: Key, event: StreamingSocketEventMap[Key]) {
    for (const listener of this.eventListeners[type])
      listener(event)
  }

  private async pumpResponses() {
    try {
      for await (const response of this.responses) {
        if (response.type === 'audio') {
          const data = Uint8Array.from(response.data)
          if (this.config.audio.format === 'pcm') {
            this.pcmChunks.push(data)
          }
          else {
            this.emit('message', new MessageEvent('message', { data: data.buffer }))
          }
          continue
        }

        if (response.event === 'session.finished') {
          this.sessionFinished = true
          if (this.config.audio.format === 'pcm' && this.pcmChunks.length > 0) {
            const wav = toWavFromPCM16(mergeAudioChunks(this.pcmChunks), this.config.audio.sampleRate)
            this.emit('message', new MessageEvent('message', { data: wav }))
          }
        }
        this.emit('message', new MessageEvent('message', { data: responseFrame(response) }))
      }

      this.completeClose(
        this.sessionFinished ? 1000 : 1011,
        this.sessionFinished ? 'Doubao speech session finished.' : 'Doubao speech response stream ended early.',
        false,
      )
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Doubao speech IPC failed.'
      this.emit('message', new MessageEvent('message', {
        data: JSON.stringify({ event: 'error', code: 'doubao_speech_error', message }),
      }))
      this.emit('error', new Event('error'))
      this.completeClose(1011, message, false)
    }
  }
}

/** Creates one Provider-owned renderer transport for a Stage speech session. */
export function createDoubaoSpeechWebSocketFactory(config: DoubaoSpeechSessionConfig) {
  return () => new DoubaoSpeechEventaSocket(config)
}

/** Synthesizes one complete preview and returns its encoded audio bytes. */
export async function synthesizeDoubaoSpeech(
  config: DoubaoSpeechSessionConfig,
  text: string,
  signal?: AbortSignal,
) {
  if (text.length === 0)
    throw new TypeError('Doubao speech requires text.')
  signal?.throwIfAborted()

  const requests = new ReadableStream<DoubaoSpeechRequest>({
    start(controller) {
      controller.enqueue({ type: 'start', config })
      controller.enqueue({ type: 'text', text })
      controller.enqueue({ type: 'finish' })
      controller.close()
    },
  })
  const invocationAbort = new AbortController()
  const abortInvocation = () => invocationAbort.abort(signal?.reason)
  signal?.addEventListener('abort', abortInvocation, { once: true })
  const invocation = createInvocation(requests, invocationAbort.signal)
  const chunks: Uint8Array[] = []
  let sessionFinished = false

  try {
    for await (const response of invocation.responses) {
      if (response.type === 'audio')
        chunks.push(Uint8Array.from(response.data))
      else if (response.event === 'session.finished')
        sessionFinished = true
    }

    if (!sessionFinished)
      throw new Error('Doubao speech ended before the session finished.')

    const output = mergeAudioChunks(chunks)
    if (output.byteLength === 0)
      throw new Error('Doubao speech returned no audio.')

    return config.audio.format === 'pcm'
      ? toWavFromPCM16(output, config.audio.sampleRate)
      : output.buffer
  }
  finally {
    signal?.removeEventListener('abort', abortInvocation)
    invocation.dispose()
  }
}
