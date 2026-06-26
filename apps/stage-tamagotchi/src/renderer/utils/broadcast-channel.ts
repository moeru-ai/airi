/**
 * Posts a BroadcastChannel event without letting a closed channel abort the caller.
 *
 * Use when:
 * - The receiver is optional or may be recreated by HMR/window lifecycle changes.
 * - The caller should continue even when the channel was already closed.
 *
 * Expects:
 * - `post` is the sender returned by `useBroadcastChannel` or a compatible wrapper.
 *
 * Returns:
 * - `true` when the event was posted, otherwise `false`.
 */
export function postBroadcastChannelEvent<T>(post: (event: T) => void, event: T, onError?: (error: unknown) => void) {
  try {
    post(event)
    return true
  }
  catch (error) {
    onError?.(error)
    return false
  }
}
