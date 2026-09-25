import type { ChatWindowMode } from '../../../shared/eventa'

/** Opens and closes the window of one chat mode. */
export interface ChatModeWindow {
  /** Shows the chat in this mode, creating the window when needed. */
  open: () => Promise<void>
  /**
   * Closes the window of this mode. It never runs while an open of the same
   * switch is in flight, because the switch runs its work one at a time.
   */
  close: () => void
}

/**
 * Keeps the open chat window in step with the saved chat mode.
 *
 * A mode switch opens one window and closes the other, and opening awaits
 * window creation. Two switches in flight could each open their window and
 * close the other one, which leaves a window that contradicts the saved mode.
 * So every piece of chat window work runs one at a time, and each switch reads
 * the mode when it runs rather than when it was asked for. However quickly the
 * user changes the mode, the last choice decides the window.
 */
export function createChatModeSwitch(params: {
  getMode: () => ChatWindowMode
  legacy: ChatModeWindow
  floating: ChatModeWindow
}) {
  let tail: Promise<unknown> = Promise.resolve()

  /** Runs chat window work after the work queued before it, even if that failed. */
  function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task)
    tail = result.catch(() => undefined)
    return result
  }

  /**
   * Shows the window of the saved mode and closes the other. The new window
   * opens first, so the chat does not disappear in between.
   */
  function show() {
    return run(async () => {
      const [next, previous] = params.getMode() === 'floating'
        ? [params.floating, params.legacy]
        : [params.legacy, params.floating]

      await next.open()
      previous.close()
    })
  }

  return { run, show }
}
