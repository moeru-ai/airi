import type { StreamTranscriptionDelta, StreamTranscriptionResult } from '@xsai/stream-transcription'

type AudioChunk = ArrayBuffer | ArrayBufferView
type FunASRStreamMode = 'online' | 'offline' | '2pass'
type FunASRStreamProtocol = 'speech-transcriber' | 'funasr-native'

export interface FunASRStreamTranscriptionOptions {
  abortSignal?: AbortSignal
  audioFs?: number
  chunkInterval?: number
  chunkSize?: number[] | string
  hotwords?: Record<string, number> | string
  inputAudioStream?: ReadableStream<AudioChunk>
  itn?: boolean
  mode?: FunASRStreamMode
  protocol?: FunASRStreamProtocol
  streamUrl?: string
  wavFormat?: string
  wavName?: string
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, reject, resolve }
}

function normalizeStreamUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function logFunASRWs(level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) {
  const logger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  const suffix = details && Object.keys(details).length > 0
    ? ` ${JSON.stringify(details)}`
    : ''
  logger(`[FunASR WS] ${message}${suffix}`)
}

function isWebSocketOpen(websocket?: WebSocket) {
  return websocket?.readyState === WebSocket.OPEN
}

function normalizeChunkSize(value: FunASRStreamTranscriptionOptions['chunkSize']) {
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => Number(item))
      .filter(item => Number.isFinite(item) && item > 0)

    return normalized.length > 0 ? normalized : [5, 10, 5]
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0)

    return normalized.length > 0 ? normalized : [5, 10, 5]
  }

  return [5, 10, 5]
}

function toArrayBuffer(chunk: AudioChunk): ArrayBuffer {
  if (chunk instanceof ArrayBuffer)
    return chunk

  if (ArrayBuffer.isView(chunk)) {
    if (chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength)
      return chunk.buffer as ArrayBuffer

    return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
  }

  throw new TypeError('Unsupported audio chunk type for FunASR streaming transcription.')
}

function createDelta(current: string, previous: string): string {
  if (!current)
    return ''

  if (!previous)
    return current

  if (current.startsWith(previous))
    return current.slice(previous.length)

  return current
}

function resolveFinalText(latestText: string, liveText: string) {
  return latestText || liveText
}

function isAbortLikeError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

async function wait(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

function createSpeechTranscriberTaskId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function createSpeechTranscriberStartFrame(options: FunASRStreamTranscriptionOptions, taskId: string) {
  return {
    header: {
      appkey: options.wavName ?? 'airi',
      message_id: createSpeechTranscriberTaskId(),
      name: 'StartTranscription',
      namespace: 'SpeechTranscriber',
      task_id: taskId,
    },
    payload: {
      enable_intermediate_result: true,
      enable_inverse_text_normalization: options.itn ?? true,
      enable_punctuation_prediction: true,
      enable_words: false,
      format: options.wavFormat ?? 'pcm',
      max_sentence_silence: 800,
      sample_rate: options.audioFs === 8000 ? 8000 : 16000,
    },
  }
}

function createSpeechTranscriberStopFrame(options: FunASRStreamTranscriptionOptions, taskId: string) {
  return {
    header: {
      appkey: options.wavName ?? 'airi',
      message_id: createSpeechTranscriberTaskId(),
      name: 'StopTranscription',
      namespace: 'SpeechTranscriber',
      task_id: taskId,
    },
    payload: undefined,
  }
}

export function streamFunASRTranscription(options: FunASRStreamTranscriptionOptions): StreamTranscriptionResult {
  const streamUrl = normalizeStreamUrl(options.streamUrl)
  if (!streamUrl)
    throw new Error('FunASR stream URL is required for streaming transcription.')

  const audioStream = options.inputAudioStream
  if (!(audioStream instanceof ReadableStream))
    throw new TypeError('Audio stream must be provided as a ReadableStream for FunASR streaming transcription.')

  const deferredText = createDeferred<string>()
  const protocol = options.protocol ?? 'speech-transcriber'
  const taskId = createSpeechTranscriberTaskId()
  let websocket: WebSocket | undefined
  let textStreamCtrl: ReadableStreamDefaultController<string> | undefined
  let fullStreamCtrl: ReadableStreamDefaultController<StreamTranscriptionDelta> | undefined
  let closed = false
  let connectionStarted = protocol === 'funasr-native'
  let latestLiveText = ''
  let latestResolvedText = ''
  let isFinalMessageSeen = false
  let remoteClosed = false
  const startAcknowledged = createDeferred<void>()

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

  const closeControllers = (reason?: unknown) => {
    if (closed)
      return

    closed = true
    if (reason) {
      fullStreamCtrl?.error(reason)
      textStreamCtrl?.error(reason)
      deferredText.reject(reason)
      return
    }

    fullStreamCtrl?.close()
    textStreamCtrl?.close()
    deferredText.resolve(resolveFinalText(latestResolvedText, latestLiveText))
  }

  const emitDelta = (delta: string, type: StreamTranscriptionDelta['type']) => {
    if (!delta)
      return

    const payload: StreamTranscriptionDelta = { delta, type }
    fullStreamCtrl?.enqueue(payload)
    if (type === 'transcript.text.delta')
      textStreamCtrl?.enqueue(delta)
  }

  const sendStopFrame = async () => {
    if (!isWebSocketOpen(websocket)) {
      logFunASRWs('warn', 'skip stop frame because websocket is not open', {
        protocol,
        readyState: websocket?.readyState,
        streamUrl,
        taskId,
      })
      return
    }

    if (protocol === 'speech-transcriber') {
      logFunASRWs('info', 'sending StopTranscription frame', { protocol, streamUrl, taskId })
      websocket?.send(JSON.stringify(createSpeechTranscriberStopFrame(options, taskId)))
      return
    }

    logFunASRWs('info', 'sending native stop frame', { protocol, streamUrl })
    websocket?.send(JSON.stringify({ is_speaking: false }))
  }

  void (async () => {
    const reader = audioStream.getReader()

    try {
      await new Promise<void>((resolve, reject) => {
        websocket = new WebSocket(streamUrl)
        websocket.binaryType = 'arraybuffer'
        logFunASRWs('info', 'connecting websocket', { protocol, streamUrl, taskId })

        const abortHandler = () => {
          logFunASRWs('info', 'abort signal received', {
            protocol,
            reason: options.abortSignal?.reason instanceof Error ? options.abortSignal.reason.message : String(options.abortSignal?.reason ?? ''),
            streamUrl,
            taskId,
          })
          websocket?.close(1000, 'aborted')
          reject(options.abortSignal?.reason ?? new DOMException('Aborted', 'AbortError'))
        }

        if (options.abortSignal?.aborted) {
          abortHandler()
          return
        }

        options.abortSignal?.addEventListener('abort', abortHandler, { once: true })

        websocket.onopen = () => {
          try {
            logFunASRWs('info', 'websocket opened', { protocol, streamUrl, taskId })
            if (protocol === 'speech-transcriber') {
              logFunASRWs('info', 'sending StartTranscription frame', {
                audioFs: options.audioFs ?? 16000,
                protocol,
                streamUrl,
                taskId,
                wavFormat: options.wavFormat ?? 'pcm',
              })
              websocket?.send(JSON.stringify(createSpeechTranscriberStartFrame(options, taskId)))
            }
            else {
              logFunASRWs('info', 'sending native start frame', {
                audioFs: options.audioFs ?? 16000,
                chunkInterval: options.chunkInterval ?? 10,
                chunkSize: normalizeChunkSize(options.chunkSize),
                mode: options.mode ?? '2pass',
                protocol,
                streamUrl,
              })
              websocket?.send(JSON.stringify({
                audio_fs: options.audioFs ?? 16000,
                chunk_interval: options.chunkInterval ?? 10,
                chunk_size: normalizeChunkSize(options.chunkSize),
                hotwords: typeof options.hotwords === 'string' ? options.hotwords : options.hotwords ? JSON.stringify(options.hotwords) : '',
                is_speaking: true,
                itn: options.itn ?? true,
                mode: options.mode ?? '2pass',
                wav_format: options.wavFormat ?? 'pcm',
                wav_name: options.wavName ?? 'airi-live-stream',
              }))
              startAcknowledged.resolve()
            }
            resolve()
          }
          catch (error) {
            reject(error)
          }
        }

        websocket.onerror = () => {
          logFunASRWs('error', 'websocket error event received', { protocol, streamUrl, taskId })
          reject(new Error('FunASR WebSocket connection failed.'))
        }

        websocket.onmessage = ({ data }) => {
          if (typeof data !== 'string')
            return

          try {
            const payload = JSON.parse(data) as {
              header?: {
                name?: string
                status?: number
                status_message?: string
              }
              is_final?: boolean
              mode?: string
              payload?: {
                result?: string
              }
              stamp_sents?: Array<{ text?: string }>
              text?: string
            }

            const eventName = payload.header?.name ?? ''
            if (eventName === 'TaskFailed') {
              const error = new Error(payload.header?.status_message || 'SpeechTranscriber task failed.')
              logFunASRWs('error', 'server returned TaskFailed', {
                protocol,
                status: payload.header?.status,
                statusMessage: payload.header?.status_message,
                streamUrl,
                taskId,
              })
              startAcknowledged.reject(error)
              throw error
            }

            if (eventName === 'TranscriptionStarted') {
              logFunASRWs('info', 'transcription started acknowledged by server', { protocol, streamUrl, taskId })
              connectionStarted = true
              startAcknowledged.resolve()
              return
            }

            if (eventName === 'TranscriptionResultChanged') {
              const changedText = payload.payload?.result ?? ''
              const delta = createDelta(changedText, latestLiveText)
              latestLiveText = changedText
              if (delta)
                emitDelta(delta, 'transcript.text.delta')
              return
            }

            if (eventName === 'SentenceEnd') {
              latestResolvedText = payload.payload?.result ?? latestResolvedText
              return
            }

            if (eventName === 'TranscriptionCompleted') {
              isFinalMessageSeen = true
              emitDelta(resolveFinalText(latestResolvedText, latestLiveText), 'transcript.text.done')
              return
            }

            const messageText = typeof payload.text === 'string'
              ? payload.text
              : Array.isArray(payload.stamp_sents)
                ? payload.stamp_sents.map(item => item.text ?? '').join('')
                : ''

            if (!messageText && !payload.is_final)
              return

            const mode = payload.mode ?? ''
            const isOnlineLike = mode === 'online' || mode === '2pass-online'
            const isOfflineLike = mode === 'offline' || mode === '2pass-offline'

            if (isOnlineLike) {
              const delta = createDelta(messageText, latestLiveText)
              latestLiveText = messageText
              if (delta)
                emitDelta(delta, 'transcript.text.delta')
            }

            if (isOfflineLike) {
              latestResolvedText = messageText
            }

            if (payload.is_final) {
              isFinalMessageSeen = true
              emitDelta(resolveFinalText(latestResolvedText, latestLiveText), 'transcript.text.done')
            }
          }
          catch (error) {
            closeControllers(error)
          }
        }

        websocket.onclose = () => {
          remoteClosed = true
          logFunASRWs('info', 'websocket closed', {
            closedBy: options.abortSignal?.aborted ? 'client-abort' : 'remote-or-normal',
            connectionStarted,
            protocol,
            readyState: websocket?.readyState,
            streamUrl,
            taskId,
          })
          if (!connectionStarted) {
            startAcknowledged.reject(new Error('FunASR connection closed before transcription started.'))
          }
          if (!closed)
            closeControllers()
        }
      })

      await startAcknowledged.promise

      while (true) {
        if (options.abortSignal?.aborted)
          throw options.abortSignal.reason ?? new DOMException('Aborted', 'AbortError')

        const { done, value } = await reader.read()
        if (done)
          break

        if (protocol === 'speech-transcriber' && !connectionStarted)
          await startAcknowledged.promise

        if (!isWebSocketOpen(websocket)) {
          logFunASRWs('warn', 'stop sending audio because websocket is no longer open', {
            protocol,
            readyState: websocket?.readyState,
            streamUrl,
            taskId,
          })
          break
        }

        websocket?.send(toArrayBuffer(value))
      }

      logFunASRWs('info', 'audio stream ended, stopping websocket transcription', { protocol, streamUrl, taskId })
      await sendStopFrame()

      if (!isFinalMessageSeen) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      if (websocket && websocket.readyState < WebSocket.CLOSING) {
        logFunASRWs('info', 'closing websocket after normal completion', { protocol, streamUrl, taskId })
        websocket.close(1000, 'completed')
      }
    }
    catch (error) {
      if (isAbortLikeError(error) || options.abortSignal?.aborted) {
        try {
          logFunASRWs('info', 'closing websocket after client abort', {
            protocol,
            reason: error instanceof Error ? error.message : String(error),
            streamUrl,
            taskId,
          })
          await sendStopFrame()
          await wait(500)
          if (!remoteClosed && websocket?.readyState === WebSocket.OPEN)
            websocket.close(1000, 'aborted')
          closeControllers()
          return
        }
        catch {}
      }

      logFunASRWs('error', 'closing websocket after stream failure', {
        protocol,
        reason: error instanceof Error ? error.message : String(error),
        streamUrl,
        taskId,
      })
      if (websocket && websocket.readyState < WebSocket.CLOSING)
        websocket.close(1011, 'error')
      closeControllers(error)
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
