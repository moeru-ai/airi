import type { Tool } from '@xsai/shared-chat'

/** Failure reason of a run without stream activity for the stall limit. */
export const RUN_STALLED = 'Run stalled without stream activity'
/** Failure reason of a run that passed its deadline. */
export const RUN_PAST_DEADLINE = 'Run exceeded its deadline'
/** Failure reason of a run that repeated one tool call after its correction. */
export const RUN_LOOPING = 'Run repeated an identical tool call'

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

/**
 * Guards a run's tools against a loop: identical consecutive calls, by tool name and arguments.
 *
 * Use when:
 * - A run owner passes tools to a model that can call them in a loop.
 *
 * Expects:
 * - One guard per run, so the count spans every request of the run.
 *
 * Returns:
 * - `wrap`, which returns the tools with the guard. The call that reaches `limit` does not run. Its result corrects the model instead.
 *   One more identical call calls `onLoop`, so the owner ends the run.
 */
export function guardRepeatedToolCalls(limit: number, onLoop: () => void) {
  let lastKey: string | undefined
  let count = 0

  function guard(tool: Tool): Tool {
    return {
      ...tool,
      execute: (input, options) => {
        const key = `${tool.function.name}\u0000${JSON.stringify(input)}`
        count = key === lastKey ? count + 1 : 1
        lastKey = key
        if (count < limit)
          return tool.execute(input, options)
        if (count > limit)
          onLoop()
        return `You called ${tool.function.name} with the same arguments ${count} times in a row. The result does not change. Use the results you already have, or do something else.`
      },
    }
  }

  return {
    wrap(tools: Tool[] | (() => Promise<Tool[] | undefined>) | undefined): Tool[] | (() => Promise<Tool[] | undefined>) | undefined {
      if (typeof tools === 'function')
        return async () => (await tools())?.map(guard)
      return tools?.map(guard)
    },
  }
}
