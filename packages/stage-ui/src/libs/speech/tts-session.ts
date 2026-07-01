import type { IntentHandle, IntentOptions, PlaybackItem } from '@proj-airi/pipelines-audio'

import type { StreamingTtsPipelineOptions } from './streaming-pipeline'

import { createStreamingTtsPipeline } from './streaming-pipeline'

/**
 * Stage-level TTS session abstraction.
 *
 * Both the segmenter-based path (every non-streaming provider — feeds tokens
 * through `pipelines-audio`'s `IntentHandle` → segmenter → per-segment
 * `tts()` callback) and the bidirectional WebSocket path (the official
 * streaming provider — forwards raw tokens upstream and lets the model do
 * its own sentence splitting) implement this surface.
 *
 * Stage.vue holds exactly one `StageTtsSession` at any moment and forwards
 * every chat-orchestrator hook into it without branching on provider id.
 * The decision of which adapter to construct lives once in
 * {@link createStageTtsSession}.
 */
export interface StageTtsSession {
  /** Stable id for this session. Used by playback to scope cancellation. */
  readonly intentId: string
  /** Forward an LLM token. Adapter decides whether it's segmented or raw. */
  appendText: (text: string) => void
  /**
   * Forward a special token (emotion / delay marker). Segmenter adapter
   * queues it in lockstep with audio; streaming adapter fires it
   * immediately (no segmenter queue to ride; see
   * {@link createStageTtsSession} comments).
   */
  appendSpecial: (special: string) => void
  /** Signal end of LLM token stream. Caller still owes an `end()`. */
  finishInput: () => void
  /** Tear down on normal completion. */
  end: () => void
  /** Tear down on abort / new message / unmount. */
  cancel: (reason?: string) => void
}

/**
 * Minimal `IntentHandle` shape the segmenter adapter needs. Quoting the
 * full `IntentHandle` would drag in extra fields (`stream`, `priority`,
 * etc.) that are not part of the session protocol; this typed subset keeps
 * the adapter honest about what it actually depends on.
 */
type IntentHandleSubset = Pick<IntentHandle, 'intentId' | 'writeLiteral' | 'writeSpecial' | 'writeFlush' | 'end' | 'cancel'>

/**
 * Direct adapter from a `pipelines-audio` `IntentHandle` to
 * {@link StageTtsSession}. Pure passthrough — the segmenter pipeline already
 * owns segmentation, special-token queueing, and playback scheduling.
 */
function fromIntent(intent: IntentHandleSubset): StageTtsSession {
  return {
    intentId: intent.intentId,
    appendText: intent.writeLiteral,
    appendSpecial: intent.writeSpecial,
    finishInput: intent.writeFlush,
    end: intent.end,
    cancel: intent.cancel,
  }
}

/**
 * Per-session knobs the streaming adapter consumes. Snapshotted once at
 * session-open time so a mid-session provider/voice swap does not corrupt
 * an in-flight session — the hot-swap watcher in Stage.vue is responsible
 * for cancelling and re-opening.
 */
export interface StreamingSessionSnapshot {
  model: string
  voice: string
  voiceType: 'official_default' | 'official_selected' | 'custom_configured' | 'voice_pack' | 'unknown'
  bufferEntireSession: boolean
  extraBody: Record<string, unknown>
  /**
   * `ownerId` to stamp on each `PlaybackItem`. Mirrors the value the
   * segmenter-based intent uses (`activeCardId`) so playback manager
   * owner-quota policies treat both paths identically.
   */
  ownerId?: string
  /**
   * Called when the host wants a special token (emotion / delay marker)
   * dispatched. Streaming has no in-band queue to ride; this callback
   * fires immediately on `appendSpecial`. Without it the streaming adapter
   * would silently drop emotion/delay tokens. The host wires this to
   * something like `playSpecialToken` (Stage.vue's existing helper).
   */
  onImmediateSpecial: (special: string) => void
}

/**
 * Minimal `PlaybackManager` shape the streaming adapter writes to. Same
 * `intentId` is passed to `stopByIntent` on cancel and used as
 * `streamId`/`intentId` on every scheduled item, so cancellation reliably
 * stops every audio buffer this session emitted.
 */
export interface PlaybackManagerSubset<TAudio> {
  schedule: (item: PlaybackItem<TAudio>) => void
  stopByIntent: (intentId: string, reason: string) => void
}

/**
 * Internal helpers the streaming adapter calls out to. Lets the adapter
 * react to terminal events (error / done) by clearing whatever state the
 * host is holding — Stage.vue keeps a `currentSession` ref and needs to
 * null it when the underlying ws terminates on its own.
 */
export interface StreamingSessionHooks {
  /** Called once when the ws terminates with an error. */
  onError?: (err: Error) => void
  /** Called once when the ws terminates (success or error follows). */
  onDone?: () => void
}

export interface CreateStreamingSessionOptions<TAudio = AudioBuffer> {
  intentId: string
  snapshot: StreamingSessionSnapshot
  audioContext: BaseAudioContext
  playbackManager: PlaybackManagerSubset<TAudio>
  hooks?: StreamingSessionHooks
  /**
   * Optional override for the underlying pipeline factory. Tests inject a
   * stub here; production wires the real `createStreamingTtsPipeline`.
   *
   * @default {@link createStreamingTtsPipeline}
   */
  pipelineFactory?: (options: StreamingTtsPipelineOptions) => ReturnType<typeof createStreamingTtsPipeline>
}

/**
 * Streaming adapter: opens ONE ws session for the whole intent and
 * schedules sentences into the playback manager as they arrive. Cancel
 * tells the pipeline to send `cancel` upstream AND drains any already-queued
 * playback items that belong to this intent.
 *
 * Use when:
 * - The active provider has the streaming surface enabled and a voice picked.
 *
 * Expects:
 * - `audioContext` is the same context the playback manager's `play`
 *   callback will use to attach the buffer source. Mismatched contexts will
 *   throw on decode.
 *
 * Returns:
 * - A {@link StageTtsSession} whose `appendSpecial` is intentionally
 *   immediate (no segmenter to align with); see {@link createStageTtsSession}.
 */
export function createStreamingTtsSession<TAudio = AudioBuffer>(
  options: CreateStreamingSessionOptions<TAudio>,
): StageTtsSession {
  const { intentId, snapshot, audioContext, playbackManager, hooks } = options
  const pipelineFactory = options.pipelineFactory ?? createStreamingTtsPipeline

  let sequence = 0
  let terminated = false

  const handle = pipelineFactory({
    model: snapshot.model,
    voice: snapshot.voice,
    ttsVoiceType: snapshot.voiceType,
    audioContext,
    bufferEntireSession: snapshot.bufferEntireSession,
    extraBody: snapshot.extraBody,
    onSentence: ({ index, text, audio }) => {
      if (terminated)
        return
      playbackManager.schedule({
        id: `${intentId}-${index}`,
        streamId: intentId,
        intentId,
        segmentId: `${intentId}-${index}`,
        sequence: sequence++,
        ownerId: snapshot.ownerId,
        priority: 0,
        text: text ?? '',
        special: null,
        audio: audio as unknown as TAudio,
        createdAt: Date.now(),
      })
    },
    onError: (err) => {
      hooks?.onError?.(err)
    },
    onDone: () => {
      terminated = true
      hooks?.onDone?.()
    },
  })

  function cancel(reason?: string) {
    if (terminated) {
      // Pipeline already closed itself; still drain any playback items it
      // managed to queue before terminating.
      playbackManager.stopByIntent(intentId, reason ?? 'session-already-terminated')
      return
    }
    terminated = true
    handle.cancel()
    playbackManager.stopByIntent(intentId, reason ?? 'session-cancelled')
  }

  return {
    intentId,
    appendText: handle.appendText,
    // Streaming has no in-band queue to align audio with; fire the host's
    // immediate-special callback so emotion / delay tokens still reach the
    // queues. The perceptual mis-alignment vs audio is minor — codex
    // review and the segmenter parity comment in Stage.vue prior to the
    // refactor both accept it.
    appendSpecial: snapshot.onImmediateSpecial,
    finishInput: handle.finish,
    end: () => {
      // `finish()` already drove session.finished → onDone; nothing extra
      // to do here. Kept as a method for protocol symmetry with the
      // segmenter adapter.
    },
    cancel,
  }
}

/**
 * Speech transport flavours the host knows how to drive. Mirrors the
 * `capabilities.speech.transport` enum on `ProviderDefinition`. Anything
 * the factory does not recognise is treated as `'rest'`.
 */
export type SpeechTransport = 'rest' | 'bidirectional-ws'

/**
 * Build context required by {@link createStageTtsSession}. Kept as a
 * single object so Stage.vue can construct it once per intent without
 * threading a dozen positional args.
 */
export interface StageTtsSessionContext<TAudio = AudioBuffer> {
  /**
   * Transport flavour of the active provider, read by the host from
   * `ProviderDefinition.capabilities.speech.transport`. `'rest'` (or any
   * other value) routes through the segmenter; `'bidirectional-ws'`
   * routes through the streaming WebSocket adapter.
   */
  transport: SpeechTransport | undefined
  /**
   * Snapshot of the streaming provider's settings. Used only when
   * `transport === 'bidirectional-ws'` and the snapshot is non-null with
   * a voice picked. Returning `null` is a graceful "not ready yet" signal
   * and falls back to the segmenter path.
   */
  streaming?: () => StreamingSessionSnapshot | null
  /** Host audio context. Required for the streaming path. */
  audioContext: BaseAudioContext | undefined
  /** Playback manager Stage uses for scheduling. */
  playbackManager: PlaybackManagerSubset<TAudio>
  /**
   * Factory for a fresh `IntentHandle` (segmenter path). Stage wires this
   * to `speechRuntimeStore.openIntent`.
   */
  openIntent: (options: IntentOptions) => IntentHandleSubset
  /**
   * Default intent options for the segmenter path. Stage.vue's existing
   * call passed `{ownerId, priority:'normal', behavior:'queue'}`; we keep
   * the same defaults here.
   */
  intentOptions: () => IntentOptions
  /** Lifecycle hooks shared by both paths. */
  hooks?: StreamingSessionHooks
}

/**
 * One decision point: streaming path or segmenter path? Returns a fully
 * wired {@link StageTtsSession} so Stage.vue's chat-orchestrator hooks
 * never branch on provider id again.
 *
 * Use when:
 * - `onBeforeMessageComposed` fires and Stage needs a fresh session for
 *   the next LLM intent.
 *
 * Expects:
 * - Caller has already cancelled / cleared any previous session ref.
 * - When `transport === 'bidirectional-ws'`, the snapshot's `voice` is
 *   a real voice id and `audioContext` is set; otherwise the factory
 *   silently falls back to the segmenter path (codex review MEDIUM #3
 *   noted this fallback should not silently re-enter the legacy
 *   per-segment path inside `tts()` — the segmenter adapter routes
 *   through the normal segmenter+tts callback, which is the intended
 *   behaviour for every REST provider).
 *
 * Returns:
 * - A `StageTtsSession`. Stage.vue stores it in a single `currentSession`
 *   ref and calls `appendText` / `appendSpecial` / `finishInput` / `end`
 *   / `cancel` on it from the hooks.
 */
export function createStageTtsSession<TAudio = AudioBuffer>(
  ctx: StageTtsSessionContext<TAudio>,
): StageTtsSession {
  const wantsStreaming = ctx.transport === 'bidirectional-ws'
  const snapshot = wantsStreaming ? ctx.streaming?.() ?? null : null
  const canStream = wantsStreaming
    && snapshot != null
    && snapshot.voice.length > 0
    && ctx.audioContext != null

  if (!canStream) {
    // Segmenter path: open the existing IntentHandle and adapt 1:1.
    return fromIntent(ctx.openIntent(ctx.intentOptions()))
  }

  const intentId = createStreamingIntentId()
  return createStreamingTtsSession<TAudio>({
    intentId,
    snapshot: snapshot!,
    audioContext: ctx.audioContext!,
    playbackManager: ctx.playbackManager,
    hooks: ctx.hooks,
  })
}

function createStreamingIntentId(): string {
  return `stream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
