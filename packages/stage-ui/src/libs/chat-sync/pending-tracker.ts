/**
 * Pending-promise tracker that lets a holder cancel every in-flight promise
 * with a single `drainAll(error)`. Built for the chat-ws RPC layer where
 * `eventa@0.3.0`'s `defineInvoke` stores promise resolvers in a closure-
 * scoped Map with no public flush API — disposing the WS context does NOT
 * settle the pending invokes, leaving callers hanging. We wrap every
 * RPC invoke in `track()` so `drainAll()` from disposeContext can reject
 * them with a concrete error.
 *
 * Use when:
 * - You have an external promise source you cannot abort directly, and
 *   you need a way to surface a hard cancellation to all in-flight callers
 *   when the underlying transport tears down.
 *
 * Expects:
 * - Wrapped promises eventually settle on their own (success or external
 *   reject). The tracker only adds an alternative early-reject path.
 *
 * Returns:
 * - `track(promise)` — wraps and returns a new promise that races between
 *   the original outcome and a `drainAll` cancel.
 * - `drainAll(error)` — settles every currently-pending tracked promise
 *   with the given error and clears the set.
 * - `size()` — current count of in-flight tracked promises (testing /
 *   reactive surfacing).
 */
export interface PendingTracker {
  track: <T>(promise: Promise<T>) => Promise<T>
  drainAll: (error: Error) => void
  size: () => number
}

export function createPendingTracker(): PendingTracker {
  const pending = new Set<(err: Error) => void>()

  function track<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const rejectIfPending = (err: Error) => {
        if (settled)
          return
        settled = true
        pending.delete(rejectIfPending)
        reject(err)
      }
      pending.add(rejectIfPending)
      promise.then(
        (value) => {
          if (settled)
            return
          settled = true
          pending.delete(rejectIfPending)
          resolve(value)
        },
        (err) => {
          if (settled)
            return
          settled = true
          pending.delete(rejectIfPending)
          reject(err)
        },
      )
    })
  }

  function drainAll(error: Error) {
    if (pending.size === 0)
      return
    // Snapshot first because the reject callback removes itself from the
    // set as a side effect; iterating directly would skip entries.
    const snapshot = Array.from(pending)
    pending.clear()
    for (const reject of snapshot) {
      try {
        reject(error)
      }
      catch {}
    }
  }

  return {
    track,
    drainAll,
    size: () => pending.size,
  }
}
