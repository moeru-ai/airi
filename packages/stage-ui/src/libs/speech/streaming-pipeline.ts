import type { SpeechAudio } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { createPushStream } from '@proj-airi/pipelines-audio'
import { nanoid } from 'nanoid/non-secure'

import { getAuthToken } from '../auth'
import { SERVER_URL } from '../server'

/**
 * One synthesized sentence emitted by the streaming pipeline. The pipeline
 * delivers these in arrival order; consumers schedule them into their
 * playback manager directly.
 */
export interface StreamingPipelineSentence {
  /** 0-based sentence index within the session. */
  index: number
  /** Sentence text from the upstream `sentence.*` payload, when available. */
  text: string
  /** Decoded audio. Same `AudioContext` is used for every sentence in the session. */
  audio: AudioBuffer
}

export interface StreamingTtsPipelineEvents {
  /**
   * Fires once per synthesized sentence (TTS 1.0) or once per session
   * (TTS 2.0 / `bufferEntireSession: true`). Schedule the audio into your
   * playback manager from this callback.
   */
  onSentence?: (sentence: StreamingPipelineSentence) => void
  /**
   * Surfaced for any post-upgrade failure (server `error` event, ws close
   * without `session.finished`, decode failure). Consumers should treat the
   * session as terminated after this fires.
   */
  onError?: (err: Error) => void
  /**
   * Fires after the ws closes for any reason. Always paired with either
   * `onSentence` (success path) or `onError` (failure path) preceding it.
   */
  onDone?: () => void
}

export interface StreamingTtsPipelineOptions extends StreamingTtsPipelineEvents {
  /** Server URL override. Defaults to {@link SERVER_URL}. */
  serverUrl?: string
  /** Override the auth token (Bearer). Defaults to {@link getAuthToken}. */
  token?: string
  /** unspeech-routed model id, e.g. `volcengine/seed-tts-2.0`. */
  model: string
  /** Upstream voice / speaker id. */
  voice: string
  /** OpenAI-style format. Default `mp3`. */
  responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm'
  /** Backend-specific knobs forwarded as the `extra_body` of the `start` frame. */
  extraBody?: Record<string, unknown>
  /** Business trigger hint sent to server-side product analytics. */
  ttsTrigger?: 'auto' | 'manual'
  /** Low-cardinality source hint sent to server-side product analytics. */
  ttsSource?: 'chat_auto_tts' | 'manual_preview' | 'settings_test'
  /** Low-cardinality voice bucket sent to server-side product analytics. */
  ttsVoiceType?: 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'
  turnId?: string
  /**
   * Decoder context. The pipeline calls `decodeAudioData` on it for each
   * sentence (or once at session end in buffered mode). Reusing the page's
   * AudioContext is required so playback nodes that connect to its
   * destination see compatible sample rates.
   */
  audioContext: BaseAudioContext
  /**
   * When `true`, accumulate every binary chunk until `session.finished` and
   * emit ONE `onSentence`. Use for models where per-sentence audio boundaries
   * are not synchronously aligned with `sentence.end` events (Volcengine
   * Seed-TTS 2.0 ships subtitles asynchronously; chunking on `sentence.end`
   * would drop frames). Default `false` (chunk per sentence — correct for
   * Seed-TTS 1.0 / ICL 1.0 where `sentence.end` arrives in-band with audio).
   */
  bufferEntireSession?: boolean
}

export interface StreamingTtsPipelineHandle {
  /**
   * Forward a chunk of LLM-generated text to the in-flight TTS session.
   * The text is sent verbatim — no client-side segmentation. The upstream
   * model decides where to split sentences and how to pace prosody.
   *
   * Safe to call before the ws is open; frames are queued and flushed
   * after the handshake completes.
   */
  appendText: (text: string) => void
  /**
   * Signal end of the LLM text stream. The upstream emits any remaining
   * audio then `session.finished`; the pipeline closes the ws after.
   */
  finish: () => void
  /**
   * Abort the in-flight session. Sends `cancel` upstream (best-effort, no
   * ack wait per protocol v1) and closes the ws.
   */
  cancel: () => void
}

/** Connects the existing WebSocket protocol to SpeechStream. Normal text EOF flushes synthesis. Cancellation releases its reader and transport. */
export function streamSpeech(options: Omit<StreamingTtsPipelineOptions, keyof StreamingTtsPipelineEvents>, text: ReadableStream<string>, signal: AbortSignal): ReadableStream<SpeechAudio> {
  const reader = text.getReader()
  const sourceId = nanoid()
  let frame = 0
  let closed = false
  let handle: StreamingTtsPipelineHandle | undefined
  const output = createPushStream<SpeechAudio>(() => stop())

  function stop(error?: Error) {
    if (closed)
      return
    closed = true
    signal.removeEventListener('abort', abort)
    handle?.cancel()
    void reader.cancel(error).catch(() => {})
    if (error)
      output.error(error)
    else
      output.close()
  }

  function abort() {
    stop(new DOMException('Speech synthesis cancelled', 'AbortError'))
  }

  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) {
    abort()
    reader.releaseLock()
    return output.stream
  }

  handle = createStreamingTtsPipeline({
    ...options,
    onSentence: ({ audio, text }) => {
      if (closed)
        return
      const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel).slice())
      const block: PcmBlock = { range: { sourceId, startFrame: frame, endFrame: frame + audio.length }, sampleRate: audio.sampleRate, channels }
      output.write({ text, audio: new ReadableStream<PcmBlock>({ start(controller) {
        controller.enqueue(block)
        controller.close()
      } }) })
      frame += audio.length
    },
    onError: error => stop(error),
    onDone: () => stop(),
  })

  void (async () => {
    try {
      while (true) {
        const result = await reader.read()
        if (closed)
          return
        if (result.done) {
          handle?.finish()
          return
        }
        handle?.appendText(result.value)
      }
    }
    catch (cause) {
      stop(cause instanceof Error ? cause : new Error('Speech text stream failed', { cause }))
    }
    finally {
      reader.releaseLock()
    }
  })()
  return output.stream
}

/**
 * Drives a single bidirectional streaming TTS session for one LLM intent.
 *
 * Use when:
 * - You have a streaming LLM output you want voiced without client-side
 *   sentence segmentation. The upstream model receives raw token chunks
 *   and decides where to split.
 *
 * Expects:
 * - Authenticated user (or `options.token`).
 * - `STREAMING_TTS_UPSTREAM` configKV configured server-side.
 *
 * Returns:
 * - A handle with `appendText` / `finish` / `cancel`. Side-effect: audio
 *   AudioBuffers are emitted via `options.onSentence` in arrival order.
 */
export function createStreamingTtsPipeline(options: StreamingTtsPipelineOptions): StreamingTtsPipelineHandle {
  const token = options.token ?? getAuthToken()
  if (!token) {
    const err = new Error('streaming-pipeline: not authenticated')
    queueMicrotask(() => {
      options.onError?.(err)
      options.onDone?.()
    })
    return noopHandle()
  }

  const wsUrl = toWebSocketUrl(options.serverUrl ?? SERVER_URL, '/api/v1/audio/speech/ws', token, {
    ttsTrigger: options.ttsTrigger ?? 'auto',
    ttsSource: options.ttsSource ?? 'chat_auto_tts',
    ttsVoiceType: options.ttsVoiceType ?? 'unknown',
    turnId: options.turnId,
  })
  const ws = new WebSocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  let closed = false
  let sawSessionFinished = false
  /**
   * Queue for frames sent before the ws transitions to OPEN. Avoids
   * silently dropping early `appendText` calls (the caller doesn't know
   * the handshake hasn't completed yet).
   */
  const beforeOpenQueue: string[] = []
  /** Binary chunks accumulated since the last sentence flush. */
  let chunks: ArrayBuffer[] = []
  let chunkBytes = 0
  let sentenceIndex = 0
  /**
   * Serializes sentence decoding before termination. A cleared chunk buffer does not mean its decoding has finished.
   * Waiting for this tail prevents onDone from closing SpeechStream before the final sentence arrives.
   */
  let pendingFlush: Promise<void> = Promise.resolve()
  let terminationRequested = false
  /**
   * FIFO of sentence texts seen via `sentence.start` events that haven't
   * been paired with a `sentence.end` yet. The protocol promises in-order
   * pairs, but a buggy upstream or re-ordered transport could send two
   * `sentence.start`s in a row; using a queue (instead of a single
   * `pendingSentenceText` variable) keeps each audio buffer labelled with
   * the right text instead of overwriting. Codex review MEDIUM #4.
   */
  const pendingSentenceTexts: string[] = []
  const bufferEntireSession = options.bufferEntireSession ?? false

  function safeSend(payload: string) {
    if (closed)
      return
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
      return
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      beforeOpenQueue.push(payload)
    }
    // CLOSING/CLOSED — drop silently; caller will see onDone shortly.
  }

  async function flushAccumulatedAsSentence(
    sentenceChunks: ArrayBuffer[],
    sentenceChunkBytes: number,
    textOverride?: string,
  ) {
    if (sentenceChunkBytes === 0)
      return
    const merged = new Uint8Array(sentenceChunkBytes)
    let offset = 0
    for (const c of sentenceChunks) {
      merged.set(new Uint8Array(c), offset)
      offset += c.byteLength
    }

    // Prefer the explicit override (the `sentence.end` payload's own text)
    // over the queued `sentence.start` text — `sentence.end` is the
    // authoritative pairing. The queue covers the case where `sentence.end`
    // arrives without a text field.
    const text = textOverride ?? pendingSentenceTexts.shift() ?? ''

    try {
      // decodeAudioData needs a transferable ArrayBuffer; pass the buffer
      // backing `merged`. Clone to a fresh buffer so subsequent flushes do
      // not race on a buffer the decoder may detach.
      const audio = await options.audioContext.decodeAudioData(merged.buffer.slice(0))
      options.onSentence?.({ index: sentenceIndex++, text, audio })
    }
    catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  function enqueueFlush(textOverride?: string): Promise<void> {
    const sentenceChunks = chunks
    const sentenceChunkBytes = chunkBytes
    chunks = []
    chunkBytes = 0

    // `.catch(() => {})` keeps a single decode failure from poisoning the
    // tail of the chain — failures already surface via `onError` inside
    // `flushAccumulatedAsSentence`.
    pendingFlush = pendingFlush.then(() => flushAccumulatedAsSentence(sentenceChunks, sentenceChunkBytes, textOverride)).catch(() => {})
    return pendingFlush
  }

  async function requestTerminate(err: Error | null) {
    if (closed || terminationRequested)
      return
    terminationRequested = true
    // Wait for every queued flush (and its `onSentence` dispatch) to drain
    // before flipping `closed`. Without this await, late-resolving decodes
    // would land after `onDone` has already set `terminated = true` in the
    // consumer adapter and be dropped — that is the "last sentence missing"
    // symptom observed in the wild.
    await pendingFlush
    terminate(err)
  }

  ws.addEventListener('open', () => {
    const startFrame = {
      event: 'start',
      model: options.model,
      voice: options.voice,
      response_format: options.responseFormat ?? 'mp3',
      ...(options.extraBody ? { extra_body: options.extraBody } : {}),
    }
    ws.send(JSON.stringify(startFrame))
    for (const payload of beforeOpenQueue)
      ws.send(payload)
    beforeOpenQueue.length = 0
  })

  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string') {
      void handleControlFrame(e.data)
      return
    }
    // binary audio chunk
    if (e.data instanceof ArrayBuffer) {
      chunks.push(e.data)
      chunkBytes += e.data.byteLength
    }
  })

  async function handleControlFrame(raw: string) {
    let evt: { event?: string, payload?: Record<string, unknown>, text?: string, code?: string, message?: string }
    try {
      evt = JSON.parse(raw)
    }
    catch {
      return
    }

    switch (evt.event) {
      case 'sentence.start': {
        // Append to the queue. `sentence.end` consumes from the head, so
        // back-to-back `sentence.start`s (which shouldn't happen but
        // codex MEDIUM #4 noted the race) don't clobber each other.
        const text = readSentenceText(evt.payload)
        if (text != null)
          pendingSentenceTexts.push(text)
        break
      }
      case 'sentence.end': {
        if (bufferEntireSession)
          break
        const text = readSentenceText(evt.payload) ?? pendingSentenceTexts.shift() ?? ''
        // Fire-and-forget into the serialized chain. We do NOT await here;
        // awaiting from the message handler does not block sibling handlers
        // (they run concurrently via `void handleControlFrame`), so an
        // await would only delay this handler's own return without
        // preventing the session.finished race. The chain itself is what
        // enforces ordering.
        void enqueueFlush(text)
        break
      }
      case 'subtitle': {
        // TTS 2.0 emits subtitle events asynchronously (may arrive after
        // the next sentence's audio has already started). We surface the
        // text via the queue but do NOT flush audio here — buffered mode
        // flushes once at session.finished instead.
        const text = readSentenceText(evt.payload)
        if (text != null)
          pendingSentenceTexts.push(text)
        break
      }
      case 'session.finished': {
        sawSessionFinished = true
        void enqueueFlush()
        void requestTerminate(null)
        break
      }
      case 'error': {
        const code = evt.code ?? 'streaming_tts_error'
        const message = evt.message ?? code
        void requestTerminate(new Error(`${code}: ${message}`))
        break
      }
    }
  }

  ws.addEventListener('close', (ev) => {
    if (closed)
      return
    if (sawSessionFinished) {
      // Normal end after `session.finished`; the session.finished handler
      // already enqueued the tail flush and called requestTerminate. Just
      // make sure termination happens even if that path somehow didn't
      // (idempotent — requestTerminate guards against re-entry).
      void requestTerminate(null)
      return
    }
    // Closed before completion: surface as an error so callers don't
    // mistake truncated audio for a successful (short) sentence.
    const reason = ev.reason || `closed_${ev.code}`
    void requestTerminate(new Error(`streaming_tts_closed: ${reason}`))
  })

  ws.addEventListener('error', () => {
    // The `error` event carries no useful info per the WebSocket API; the
    // `close` event right after has the actual reason. Don't double-emit.
  })

  function terminate(err: Error | null) {
    if (closed)
      return
    closed = true

    const triggerCallbacks = () => {
      if (err != null)
        options.onError?.(err)
      options.onDone?.()
    }

    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        // NOTICE:
        // Deferring ws.close() and callbacks to the next event loop tick allows the WebSocket
        // to flush any pending outgoing messages (like 'cancel') before closing the connection.
        // packages/stage-ui/src/libs/speech/streaming-pipeline.ts
        // Can be removed if the WebSocket implementation natively flushes the write buffer before close.
        setTimeout(() => {
          try {
            ws.close()
          }
          catch {}
          triggerCallbacks()
        }, 0)
        return
      }
    }
    catch {}
    triggerCallbacks()
  }

  return {
    appendText(text: string) {
      if (text.length === 0)
        return
      // Preserve whitespace between streamed words. Dropping it joins separate tokens into different words.
      safeSend(JSON.stringify({ event: 'text', text }))
    },
    finish() {
      safeSend(JSON.stringify({ event: 'finish' }))
    },
    cancel() {
      if (closed || terminationRequested)
        return
      safeSend(JSON.stringify({ event: 'cancel' }))
      // Let pending decoding settle before onDone. SpeechStream rejects chunks after cancellation and owns playback termination.
      void requestTerminate(null)
    },
  }
}

function noopHandle(): StreamingTtsPipelineHandle {
  return { appendText: () => {}, finish: () => {}, cancel: () => {} }
}

function toWebSocketUrl(
  httpBase: string,
  path: string,
  token: string,
  analytics: {
    ttsTrigger: 'auto' | 'manual'
    ttsSource: 'chat_auto_tts' | 'manual_preview' | 'settings_test'
    ttsVoiceType: 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'
    turnId?: string
  },
): string {
  const u = new URL(path, httpBase)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.searchParams.set('token', token)
  u.searchParams.set('tts_trigger', analytics.ttsTrigger)
  u.searchParams.set('tts_source', analytics.ttsSource)
  u.searchParams.set('tts_voice_type', analytics.ttsVoiceType)
  if (analytics.turnId)
    u.searchParams.set('turn_id', analytics.turnId)
  return u.toString()
}

/**
 * Reads the sentence text from a `sentence.start` / `sentence.end` /
 * `subtitle` payload. Returns `null` when the payload doesn't carry one
 * (e.g. final upstream events with empty bodies).
 */
function readSentenceText(payload: Record<string, unknown> | undefined): string | null {
  if (!payload || typeof payload !== 'object')
    return null
  const text = (payload as { text?: unknown }).text
  return typeof text === 'string' ? text : null
}
