import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { errorMessageFrom } from '@moeru/std'
import { array, boolean, nullish, number, object, optional, picklist, safeParse, string, unknown } from 'valibot'

/** Model Studio realtime inference endpoint in the Singapore region. */
export const DASHSCOPE_INTL_INFERENCE_WS_URL = 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference'
export const DASHSCOPE_FUN_ASR_DEFAULT_MODEL = 'fun-asr-realtime'
/** Silence that ends a sentence. The service default is 1300 ms. The API accepts 200 to 6000 ms. */
export const DASHSCOPE_FUN_ASR_DEFAULT_SENTENCE_SILENCE_MS = 400

/**
 * Bytes of 16 kHz mono PCM16 to send per upstream frame.
 * The client sends 8 ms chunks. The service recommends frames of about 100 ms.
 * 1600 bytes is 50 ms, so batching adds at most 50 ms.
 */
const UPSTREAM_FRAME_BYTES = 1600

export interface DashScopeFunAsrCredentials {
  apiKey: string
  model: string
  websocketURL: string
  maxSentenceSilenceMs: number
}

interface CreateDashScopeFunAsrStreamResponseOptions {
  audioStream: ReadableStream<Uint8Array>
  credentials: DashScopeFunAsrCredentials
}

const sentenceSchema = object({
  sentence_id: optional(number()),
  text: optional(string(), ''),
  sentence_end: optional(boolean(), false),
  heartbeat: nullish(boolean()),
  begin_time: nullish(number()),
  end_time: nullish(number()),
  words: optional(array(object({}))),
})

const serverEventSchema = object({
  header: object({
    event: picklist(['task-started', 'result-generated', 'task-finished', 'task-failed']),
    task_id: optional(string()),
    error_code: optional(string()),
    error_message: optional(string()),
  }),
  payload: optional(unknown()),
})

const resultPayloadSchema = object({
  output: object({ sentence: sentenceSchema }),
})

const encoder = new TextEncoder()

type TranscriptEvent
  = | { type: 'transcript.text.snapshot', text: string, isFinal: boolean, locale: string, startMilliseconds: number, durationMilliseconds: number }
    | { type: 'transcript.text.done', delta: '' }

function sse(payload: TranscriptEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function taskMessage(action: 'run-task' | 'finish-task', taskId: string, credentials: DashScopeFunAsrCredentials) {
  if (action === 'finish-task')
    return JSON.stringify({ header: { action, task_id: taskId, streaming: 'duplex' }, payload: { input: {} } })

  return JSON.stringify({
    header: { action, task_id: taskId, streaming: 'duplex' },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: credentials.model,
      parameters: {
        format: 'pcm',
        sample_rate: 16000,
        max_sentence_silence: credentials.maxSentenceSilenceMs,
      },
      input: {},
    },
  })
}

/**
 * Joins final sentences and the open sentence into one transcript.
 *
 * Use when:
 * - A partial or final result arrives and the client needs the full text so far.
 *
 * Returns:
 * - Sentences in id order, joined by newlines, empty sentences removed.
 */
export function joinSentences(sentences: ReadonlyMap<number, string>): string {
  return [...sentences.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text.trim())
    .filter(Boolean)
    .join('\n')
}

async function pipeAudioToUpstream(
  audioStream: ReadableStream<Uint8Array>,
  ws: WebSocket,
  onReader: (reader: ReadableStreamDefaultReader<Uint8Array> | undefined) => void,
  isStopped: () => boolean,
) {
  const reader = audioStream.getReader()
  onReader(reader)
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  const flush = () => {
    if (pendingBytes > 0 && !isStopped() && ws.readyState === WebSocket.OPEN)
      ws.send(Buffer.concat(pending, pendingBytes), { binary: true })
    pending = []
    pendingBytes = 0
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (!value?.byteLength)
        continue
      pending.push(value)
      pendingBytes += value.byteLength
      if (pendingBytes >= UPSTREAM_FRAME_BYTES)
        flush()
    }
    flush()
  }
  finally {
    onReader(undefined)
    reader.releaseLock()
  }
}

/**
 * Streams client microphone PCM through Model Studio Fun-ASR realtime and returns SSE transcript snapshots.
 *
 * Use when:
 * - The official ASR model routes to the `dashscope-fun-asr` provider.
 *
 * Expects:
 * - `audioStream` carries 16 kHz mono PCM16, as the Hearing worklet sends it.
 *
 * Returns:
 * - A `text/event-stream` response. Each partial or final result is a `transcript.text.snapshot`
 *   with the full text so far. The stream ends with `transcript.text.done`.
 */
export function createDashScopeFunAsrStreamResponse(options: CreateDashScopeFunAsrStreamResponseOptions): Response {
  let cancelled = false
  let finished = false
  let upstream: WebSocket | undefined
  let audioReader: ReadableStreamDefaultReader<Uint8Array> | undefined

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const taskId = randomUUID().replaceAll('-', '')
      const sentences = new Map<number, string>()
      let startMilliseconds: number | undefined
      let endMilliseconds = 0

      const finish = (error?: Error) => {
        if (finished)
          return
        finished = true
        void audioReader?.cancel()
        if (cancelled)
          return
        if (error) {
          controller.error(error)
          return
        }
        controller.enqueue(sse({ type: 'transcript.text.done', delta: '' }))
        controller.close()
      }

      const ws = new WebSocket(options.credentials.websocketURL, {
        headers: { Authorization: `Bearer ${options.credentials.apiKey}` },
      })
      upstream = ws

      ws.on('open', () => {
        if (cancelled) {
          ws.close(1000, 'client_cancelled')
          return
        }
        ws.send(taskMessage('run-task', taskId, options.credentials))
      })

      ws.on('message', (data, isBinary) => {
        if (cancelled || finished || isBinary)
          return

        let raw: unknown
        try {
          raw = JSON.parse(data.toString())
        }
        catch {
          return
        }
        const parsed = safeParse(serverEventSchema, raw)
        if (!parsed.success)
          return

        const event = parsed.output
        switch (event.header.event) {
          case 'task-started':
            void pipeAudioToUpstream(
              options.audioStream,
              ws,
              (reader) => { audioReader = reader },
              () => cancelled || finished,
            ).then(() => {
              if (!cancelled && !finished && ws.readyState === WebSocket.OPEN)
                ws.send(taskMessage('finish-task', taskId, options.credentials))
            }, (error: unknown) => {
              finish(new Error(errorMessageFrom(error) ?? 'Failed to read audio stream'))
              ws.close(1011, 'audio_read_failed')
            })
            break
          case 'result-generated': {
            const result = safeParse(resultPayloadSchema, event.payload)
            if (!result.success)
              break
            const sentence = result.output.output.sentence
            if (sentence.heartbeat)
              break
            sentences.set(sentence.sentence_id ?? sentences.size, sentence.text)
            startMilliseconds ??= sentence.begin_time ?? 0
            endMilliseconds = Math.max(endMilliseconds, sentence.end_time ?? sentence.begin_time ?? 0)
            controller.enqueue(sse({
              type: 'transcript.text.snapshot',
              text: joinSentences(sentences),
              isFinal: sentence.sentence_end,
              locale: 'und',
              startMilliseconds,
              durationMilliseconds: Math.max(0, endMilliseconds - startMilliseconds),
            }))
            break
          }
          case 'task-finished':
            finish()
            ws.close(1000, 'completed')
            break
          case 'task-failed':
            finish(new Error(`Fun-ASR task failed: ${event.header.error_code ?? 'unknown'} ${event.header.error_message ?? ''}`.trim()))
            ws.close(1000, 'task_failed')
            break
        }
      })

      ws.on('error', (error) => {
        finish(error)
      })

      ws.on('close', () => {
        finish()
      })
    },
    cancel() {
      cancelled = true
      if (audioReader)
        void audioReader.cancel()
      else if (!options.audioStream.locked)
        void options.audioStream.cancel()

      if (upstream?.readyState === WebSocket.OPEN)
        upstream.close(1000, 'client_cancelled')
      else if (upstream?.readyState === WebSocket.CONNECTING)
        upstream.terminate()
    },
  })

  return new Response(body, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/event-stream',
    },
  })
}
