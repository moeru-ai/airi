import type { ChatWindowMode } from '../../../shared/eventa'

import { Mutex } from 'es-toolkit/promise'

/** Opens and closes the window of one chat mode. */
interface ChatModeWindow {
  /** Shows the chat in this mode, creating the window when needed. */
  open: () => Promise<void>
  /** Closes the window of this mode, including one that is still being created. */
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
  const mutex = new Mutex()

  /** Runs chat window work after the work queued before it, even if that failed. */
  async function run<T>(task: () => Promise<T>): Promise<T> {
    await mutex.acquire()
    try {
      return await task()
    }
    finally {
      mutex.release()
    }
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
