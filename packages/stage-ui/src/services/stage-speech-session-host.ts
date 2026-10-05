import type { IntentBehavior, PriorityLevel } from '@proj-airi/pipelines-audio'

import type { StageTtsSession } from '../libs/speech/tts-session'

/**
 * Host-side options for opening one transport-aware speech session.
 * Mirrors the chat path's session so non-chat speakers (spark reactions,
 * plugin text) get the same bidirectional WebSocket adapter when the
 * active provider is a streaming one, instead of falling through to the
 * REST segmenter which never produces audio for streaming providers.
 */
export interface StageSpeechSessionOptions {
  /** Chat/spark turn id; playback items and caption pairs key on it. */
  turnId: string
  /** Flush-mode chunking, matching the bilingual splitter state. */
  flushBoundaries: boolean
  priority?: PriorityLevel | number
  behavior?: IntentBehavior
  ownerId?: string
}

export interface StageSpeechSessionResult {
  session: StageTtsSession
  /**
   * Whole-session buffering. Sentence boundaries arrive during synthesis, so
   * translation captions cannot align to playback and the turn must not show
   * them.
   */
  buffered: boolean
}

type Opener = (options: StageSpeechSessionOptions) => StageSpeechSessionResult | undefined

let opener: Opener | undefined

/**
 * Turns whose active speech session buffers the whole audio. The Stage host
 * marks these so its chat hook and the spark reaction path skip translation
 * captions for the turn.
 */
const bufferedTurns = new Set<string>()

/** Marks one turn's session as whole-session buffered. */
export function markBufferedSpeechTurn(turnId: string): void {
  bufferedTurns.add(turnId)
}

/** Whether the turn's speech session buffers the whole audio. */
export function isBufferedSpeechTurn(turnId: string): boolean {
  return bufferedTurns.has(turnId)
}

/** Removes one turn's buffered marker. */
export function clearBufferedSpeechTurn(turnId: string): void {
  bufferedTurns.delete(turnId)
}

/**
 * Registers the host window's session factory (Stage.vue). Returns a
 * dispose function. Other renderer windows have no host and get
 * `undefined` from {@link openStageSpeechSession}, letting callers fall
 * back to the remote intent bus.
 */
export function registerStageSpeechSessionOpener(fn: Opener): () => void {
  opener = fn
  return () => {
    if (opener === fn)
      opener = undefined
  }
}

/**
 * Opens a speech session through the same transport decision the chat
 * path uses. Returns undefined when no Stage host is mounted in this
 * window.
 */
export function openStageSpeechSession(options: StageSpeechSessionOptions): StageSpeechSessionResult | undefined {
  return opener?.(options)
}

/**
 * Whether this renderer mounts the Stage that owns speech playback.
 * Non-stage windows (for example the Electron settings window) use this
 * to leave spark:notify events to the playback window instead of
 * generating reactions the user can never hear or see captioned.
 */
export function hasStageSpeechSessionHost(): boolean {
  return opener !== undefined
}
