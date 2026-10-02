/** Failure reason of a run without stream activity for the stall limit. */
export const RUN_STALLED = 'Run stalled without stream activity'
/** Failure reason of a run that passed its deadline. */
export const RUN_PAST_DEADLINE = 'Run exceeded its deadline'

/**
 * Watches one run for a stall and for its deadline.
 *
 * Use when:
 * - A run owner, such as chat or notifications, must end work that stopped making progress.
 *
 * Expects:
 * - The owner calls `touch` on each stream event and `stop` when the run ends.
 *
 * Returns:
 * - `touch`, which restarts the stall timer, and `stop`, which clears both timers. `onExpire` runs at most once.
 */
export function superviseRun(limits: { stallTimeoutMs: number, deadlineMs: number }, onExpire: (reason: string) => void) {
  let stopped = false
  let deadline: ReturnType<typeof setTimeout> | undefined
  let stall: ReturnType<typeof setTimeout> | undefined
  const expire = (reason: string) => {
    if (stopped)
      return
    stopped = true
    clearTimeout(deadline)
    clearTimeout(stall)
    onExpire(reason)
  }
  deadline = setTimeout(expire, limits.deadlineMs, RUN_PAST_DEADLINE)
  stall = setTimeout(expire, limits.stallTimeoutMs, RUN_STALLED)

  return {
    touch() {
      if (stopped)
        return
      clearTimeout(stall)
      stall = setTimeout(expire, limits.stallTimeoutMs, RUN_STALLED)
    },
    stop() {
      stopped = true
      clearTimeout(deadline)
      clearTimeout(stall)
    },
  }
}
