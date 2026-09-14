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

type Opener = (options: StageSpeechSessionOptions) => StageTtsSession | undefined

let opener: Opener | undefined

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
export function openStageSpeechSession(options: StageSpeechSessionOptions): StageTtsSession | undefined {
  return opener?.(options)
}
