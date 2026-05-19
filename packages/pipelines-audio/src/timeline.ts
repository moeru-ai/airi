export interface TimelineClock {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export interface TimelineRunContext {
  clock: TimelineClock
  signal: AbortSignal
}

export interface TimelineItem {
  id?: string
  track: string
  run: (context: TimelineRunContext) => Promise<void> | void
}

export interface TimelineItemHandle {
  id: string
  track: string
  done: Promise<void>
  cancel: (reason?: string) => void
}

export interface TimelineOptions {
  clock?: TimelineClock
}

function createDefaultClock(): TimelineClock {
  return {
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Creates a thin named-track timeline for ordering async media/control work.
 *
 * Use when:
 * - Multiple async queues need a shared ordering clock
 * - Items on the same named track must execute serially
 *
 * Expects:
 * - Item handlers own their business side effects
 * - Cancellation is cooperative through the provided signal
 *
 * Returns:
 * - A scheduler that serializes each track while allowing different tracks to run concurrently
 */
export function createTimeline(options?: TimelineOptions) {
  const clock = options?.clock ?? createDefaultClock()
  const trackTails = new Map<string, Promise<void>>()

  function enqueue(item: TimelineItem): TimelineItemHandle {
    const id = item.id ?? createId('timeline')
    const controller = new AbortController()
    const previous = trackTails.get(item.track)

    const run = async () => {
      if (controller.signal.aborted)
        return

      await item.run({
        clock,
        signal: controller.signal,
      })
    }

    const done = previous
      ? previous.catch(() => undefined).then(run)
      : run()

    trackTails.set(item.track, done.catch(() => undefined))

    return {
      id,
      track: item.track,
      done,
      cancel(reason?: string) {
        controller.abort(reason)
      },
    }
  }

  async function flush(track?: string) {
    if (track) {
      await trackTails.get(track)
      return
    }

    await Promise.all(trackTails.values())
  }

  return {
    clock,
    enqueue,
    flush,
  }
}
