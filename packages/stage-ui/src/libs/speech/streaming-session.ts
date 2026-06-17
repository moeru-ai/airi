import { buildStreamingTtsUrl } from './tts-analytics'
import type { TtsSource, TtsTrigger } from './tts-analytics'

import { getAuthToken } from '../auth'
import { SERVER_URL } from '../server'

/**
 * One control event over the bidirectional streaming TTS protocol
 * (unspeech v1, see `unspeech/docs/wire-protocols/audio-speech-stream-v1.md`).
 *
 * Audio frames travel as raw WebSocket binary frames and never use this
 * envelope.
 */
export interface StreamingTtsServerEvent {
  event: 'session.started' | 'sentence.start' | 'sentence.end' | 'subtitle' | 'session.finished' | 'error'
  text?: string
  code?: string
  message?: string
  payload?: Record<string, unknown>
}

/**
 * Inbound bookkeeping captured during a session. Returned alongside the
 * audio buffer so UI consumers can drive captions / mouth shape from
 * sentence boundaries when the upstream model emits them.
 */
export interface StreamingTtsSessionResult {
  audio: ArrayBuffer
  /** Sentence-level events received from the gateway, in arrival order. */
  sentences: Array<{ kind: 'start' | 'end' | 'subtitle'; payload?: Record<string, unknown> }>
  /** Total bytes accumulated across all binary audio frames. */
  byteLength: number
}

export interface StreamingTtsSessionOptions {
  /** Server URL override. Defaults to {@link SERVER_URL}. */
  serverUrl?: string
  /** Override the auth token (Bearer). Defaults to {@link getAuthToken}. */
  token?: string
  /** unspeech-routed model id, e.g. `volcengine/seed-tts-2.0`. */
  model: string
  /** Upstream voice / speaker id. */
  voice: string
  /** The text to synthesize. */
  input: string
  /** OpenAI-style format. `mp3` default; streaming upstream rejects `wav`. */
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm'
  /**
   * Backend-specific knobs forwarded verbatim into the `extra_body` of the
   * `start` frame. For Volcengine: `api_resource_id`, `audio.*`, `additions`,
   * `section_id`, `context_texts`, etc.
   */
  extraBody?: Record<string, unknown>
  /** Business trigger hint sent to server-side product analytics. */
  ttsTrigger?: TtsTrigger
  /** Low-cardinality source hint sent to server-side product analytics. */
  ttsSource?: TtsSource
  /** Caller-side abort signal. Closes the ws and rejects with `AbortError`. */
  signal?: AbortSignal
}

const DEFAULT_RESPONSE_FORMAT = 'mp3' as const

/**
 * Runs one bidirectional streaming TTS session against the airi server
 * (`/api/v1/audio/speech/ws`) and returns the concatenated audio when the
 * upstream emits `session.finished`.
 *
 * Use when:
 * - The stage speech pipeline's per-segment `tts()` callback wants to use
 *   the streaming gateway instead of HTTP `/audio/speech`.
 *
 * Expects:
 * - The user is authenticated; `getAuthToken()` returns a JWT or one is
 *   passed in `options.token`.
 * - The server has `STREAMING_TTS_UPSTREAM` configured.
 *
 * Returns:
 * - `{ audio, sentences, byteLength }` once `session.finished` arrives.
 * - Rejects with the upstream `error.message` on a server error event.
 * - Rejects with the abort reason on signal abort.
 */
export async function streamingSynthesize(options: StreamingTtsSessionOptions): Promise<StreamingTtsSessionResult> {
  const token = options.token ?? getAuthToken()
  if (!token) throw new Error('streaming-tts: not authenticated')

  const baseUrl = options.serverUrl ?? SERVER_URL
  const wsUrl = buildStreamingTtsUrl(baseUrl, '/api/v1/audio/speech/ws', token, {
    ttsTrigger: options.ttsTrigger ?? 'manual',
    ttsSource: options.ttsSource ?? 'manual_preview',
  })

  const audioChunks: ArrayBuffer[] = []
  const sentences: StreamingTtsSessionResult['sentences'] = []
  let totalBytes = 0

  return new Promise<StreamingTtsSessionResult>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    let settled = false
    function settle(action: () => void) {
      if (settled) return
      settled = true
      try {
        action()
      } finally {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
          // eslint-disable-next-line no-empty
        } catch {
          // noop
        }
        if (options.signal != null) options.signal.removeEventListener('abort', onAbort)
      }
    }

    function onAbort() {
      settle(() => {
        // eslint-disable-next-line no-empty
        try {
          ws.send(JSON.stringify({ event: 'cancel' }))
        } catch {
          // noop
        }
        reject(options.signal?.reason ?? new DOMException('aborted', 'AbortError'))
      })
    }

    if (options.signal != null) {
      if (options.signal.aborted) {
        onAbort()
        return
      }
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    ws.addEventListener('open', () => {
      const startFrame = {
        event: 'start',
        model: options.model,
        voice: options.voice,
        response_format: options.responseFormat ?? DEFAULT_RESPONSE_FORMAT,
        ...(options.extraBody ? { extra_body: options.extraBody } : {}),
      }
      ws.send(JSON.stringify(startFrame))
      ws.send(JSON.stringify({ event: 'text', text: options.input }))
      ws.send(JSON.stringify({ event: 'finish' }))
    })

    // Becomes true only after the server emits `session.finished`. The close
    // handler uses this to distinguish "completed gracefully, ws then closed"
    // from "ws closed mid-stream with partial audio". Without this flag we
    // would silently resolve with truncated audio whenever the close arrived
    // before `session.finished` — exactly the failure mode codex flagged
    // (HIGH #2): the user hears a cut-off sentence and the pipeline treats it
    // as a successful segment.
    let sawSessionFinished = false

    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        let evt: StreamingTtsServerEvent
        try {
          evt = JSON.parse(e.data) as StreamingTtsServerEvent
          // eslint-disable-next-line default-case
        } catch {
          return
        }

        switch (evt.event) {
          case 'sentence.start':
            sentences.push({ kind: 'start', payload: evt.payload })
            break
          case 'sentence.end':
            sentences.push({ kind: 'end', payload: evt.payload })
            break
          case 'subtitle':
            sentences.push({ kind: 'subtitle', payload: evt.payload })
            break
          case 'session.finished': {
            sawSessionFinished = true
            settle(() => {
              const audio = concatArrayBuffers(audioChunks)
              resolve({ audio, sentences, byteLength: totalBytes })
            })
            break
          }
          case 'error': {
            const code = evt.code ?? 'streaming_tts_error'
            const message = evt.message ?? code
            settle(() => reject(new Error(`${code}: ${message}`)))
            break
          }
          default:
            break
        }
        return
      }

      // binary audio chunk
      if (e.data instanceof ArrayBuffer) {
        audioChunks.push(e.data)
        totalBytes += e.data.byteLength
      }
    })

    ws.addEventListener('error', () => {
      // The 'error' event carries no useful info per WebSocket API; the close
      // event right after will have the actual reason.
    })

    ws.addEventListener('close', (ev) => {
      settle(() => {
        // Only treat the close as success when the server explicitly told us
        // the session finished. Partial audio without session.finished means
        // the upstream was truncated (network blip, server restart, upstream
        // error not caught upstream of the close) and we must surface it as
        // an error, not as a silently shorter segment.
        if (sawSessionFinished) {
          // settle() above already resolved on session.finished; this branch
          // exists for the rare ordering where the close arrives before the
          // settle from session.finished took effect — still a success.
          resolve({ audio: concatArrayBuffers(audioChunks), sentences, byteLength: totalBytes })
          return
        }
        const reason = ev.reason || `closed_${ev.code}`
        reject(new Error(`streaming_tts_closed: ${reason} (received ${totalBytes} bytes without session.finished)`))
      })
    })
  })
}

function concatArrayBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 0) return new ArrayBuffer(0)
  if (parts.length === 1) return parts[0]
  const total = parts.reduce((acc, p) => acc + p.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(new Uint8Array(part), offset)
    offset += part.byteLength
  }
  return out.buffer
}
