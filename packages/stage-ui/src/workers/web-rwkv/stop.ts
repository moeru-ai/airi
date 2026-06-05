/**
 * Streaming stop-sequence scanner for web-rwkv generation.
 *
 * RWKV "World"/G1 chat models are trained to end an assistant turn at the next
 * role marker (`"\n\nUser:"`), not with the end-of-text token — that token is
 * rarely emitted mid-conversation. Without a stop check the model keeps going past
 * its reply, hallucinating a `User:` turn and its own next `Assistant:` turn until
 * it exhausts `max_tokens` (and that garbage then pollutes the next turn's prompt).
 *
 * The scanner sits between the per-token UTF-8 decode and the emit: it watches the
 * decoded stream for any stop sequence — including one split across tokens (e.g.
 * `"\n\n"` then `"User:"`) — and signals when to halt. To avoid emitting a partial
 * stop sequence that has to be retracted, it holds back the longest trailing run
 * that could still become a stop, releasing it only once more text proves it isn't.
 *
 * Pure (no wasm/DOM) so it can be unit-tested directly.
 */

/** A streaming stop-sequence scanner; see {@link createStopScanner}. */
export interface StopScanner {
  /**
   * Feed newly decoded text. Returns the prefix that is now safe to emit (which
   * may be empty while a possible stop sequence is still being held back). Once a
   * stop sequence is matched, returns the text up to it and latches {@link stopped}.
   */
  push: (text: string) => string
  /** Release any held-back tail at end of generation (no stop sequence matched). */
  flush: () => string
  /** True once a stop sequence has been seen; the caller should stop generating. */
  readonly stopped: boolean
}

/**
 * Length of the longest suffix of `text` that is a (proper or full) prefix of some
 * stop sequence — i.e. how many trailing chars might still grow into a stop and so
 * must not be emitted yet. Bounded by the longest stop sequence, so cost is O(1) in
 * the generated length.
 */
function heldBackTailLength(text: string, stops: string[], maxStopLen: number): number {
  const max = Math.min(text.length, maxStopLen - 1)
  for (let len = max; len > 0; len--) {
    const suffix = text.slice(text.length - len)
    if (stops.some(stop => stop.startsWith(suffix)))
      return len
  }
  return 0
}

/**
 * Create a streaming {@link StopScanner} for the given stop sequences.
 *
 * Use when:
 * - Decoding tokens incrementally and needing to halt — and trim output — at the
 *   first stop sequence, which may straddle token boundaries.
 *
 * Expects:
 * - Non-empty `stops`. Text is pushed in generation order.
 *
 * Returns:
 * - A scanner. `push` emits only text proven not to be part of a stop; `flush`
 *   releases the remaining held-back tail when generation ends without a match.
 *
 * @example
 * const s = createStopScanner(['\n\nUser:'])
 * s.push('Hi') // -> 'Hi'
 * s.push('\n\n') // -> '' (held: could become "\n\nUser:")
 * s.push('User:') // -> '' , s.stopped === true
 */
export function createStopScanner(stops: string[]): StopScanner {
  const maxStopLen = Math.max(...stops.map(s => s.length))
  // Accumulated text not yet emitted (held while it might still be part of a stop).
  let pending = ''
  let stopped = false

  return {
    get stopped() {
      return stopped
    },
    push(text) {
      if (stopped || !text)
        return ''
      pending += text

      // Earliest full stop sequence wins, so output is cut at the same place
      // regardless of which marker the model produced.
      let cut = -1
      for (const stop of stops) {
        const at = pending.indexOf(stop)
        if (at >= 0 && (cut === -1 || at < cut))
          cut = at
      }
      if (cut >= 0) {
        stopped = true
        const out = pending.slice(0, cut)
        pending = ''
        return out
      }

      const hold = heldBackTailLength(pending, stops, maxStopLen)
      const out = pending.slice(0, pending.length - hold)
      pending = pending.slice(pending.length - hold)
      return out
    },
    flush() {
      const out = pending
      pending = ''
      return out
    },
  }
}
