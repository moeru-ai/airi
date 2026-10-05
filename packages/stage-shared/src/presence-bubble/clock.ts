/**
 * Hands out the time since the last frame, once.
 *
 * The bubble is drawn from the stage's ticker and from a resize between two
 * ticks. Each asking its own source spans the same stretch twice, and a dragged
 * window then advances faster than time does.
 *
 * @param now - Reads a monotonic clock, in milliseconds.
 *
 * @example
 * const clock = createPresenceFrameClock(() => performance.now())
 * clock.since()
 * // => 0
 */
export function createPresenceFrameClock(now: () => number) {
  let last: number | undefined

  return {
    /** Milliseconds since the previous call, and zero on the first. */
    since() {
      const at = now()
      const elapsed = last === undefined ? 0 : at - last
      last = at
      return elapsed
    },
  }
}
