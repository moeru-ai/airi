import { errorMessageFrom } from '@moeru/std'

import { postBroadcastChannelEvent } from './broadcast-channel'

/**
 * Formats a user-visible failure message for the stage voice input pipeline.
 *
 * Use when:
 * - Reporting automatic voice input failures from the main stage window.
 * - Keeping toast and console messages aligned during live diagnostics.
 *
 * Expects:
 * - `action` describes the failed operation without a leading verb phrase.
 *
 * Returns:
 * - A short message with the readable error cause when one is available.
 */
export function formatVoiceInputFailure(action: string, error: unknown) {
  const message = errorMessageFrom(error)
  if (!message)
    return `Voice input failed to ${action}.`

  return `Voice input failed to ${action}: ${message}`
}

/**
 * Posts a voice input caption without letting a closed BroadcastChannel abort the voice pipeline.
 *
 * Use when:
 * - Caption output is best-effort and chat ingestion must continue even if the overlay is closed.
 *
 * Expects:
 * - `post` is the BroadcastChannel sender returned by `useBroadcastChannel`.
 *
 * Returns:
 * - `true` when the caption was posted, otherwise `false`.
 */
export function postVoiceInputCaption<T>(post: (event: T) => void, event: T, onError?: (error: unknown) => void) {
  return postBroadcastChannelEvent(post, event, onError)
}
