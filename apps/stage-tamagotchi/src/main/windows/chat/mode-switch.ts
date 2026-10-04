import type { ChatDraftHandover, ChatWindowMode } from '../../../shared/eventa'

import { Mutex, withTimeout } from 'es-toolkit/promise'

/**
 * Longest wait for the window that a switch opens to mount and put the draft
 * back. Restoring waits up to 5 seconds for the synchronized chat session, so
 * this leaves the page room to start. A window that misses it is closed.
 */
const handoverTimeout = 10_000

/** Opens and closes the window of one chat mode. */
interface ChatModeWindow {
  /** Shows the chat in this mode, creating the window when needed. */
  open: () => Promise<void>
  /** Closes the window of this mode, including one that is still being created. */
  close: () => void
  /**
   * The unsent draft of this mode's window, or `undefined` when the window is
   * closed or its composer is empty. Rejects when the window cannot answer.
   */
  collectDraft: () => Promise<ChatDraftHandover | undefined>
}

/**
 * The draft that the running switch carries into the window it opens.
 * `target` is the correlation key: only a window of that mode takes the draft
 * or settles it, so the window being closed cannot take it back.
 */
interface DraftHandover {
  target: ChatWindowMode
  draft?: ChatDraftHandover
  settle: (restored: boolean) => void
}

/**
 * Keeps the open chat window in step with the saved chat mode, without losing
 * the unsent draft on a switch.
 *
 * Every piece of chat window work runs one at a time, so a switch always
 * starts from the window the previous one left open. A switch then runs as
 * one transaction:
 *
 * 1. Collect the draft from the open window.
 * 2. Save the new mode and open its window.
 * 3. Wait until the new window has put the draft back.
 * 4. Close the previous window.
 *
 * A failure at any step closes the new window and restores the saved mode.
 * The previous window was not closed, so it still holds the draft.
 */
export function createChatModeSwitch(params: {
  getMode: () => ChatWindowMode
  setMode: (mode: ChatWindowMode) => void
  legacy: ChatModeWindow
  floating: ChatModeWindow
}) {
  const mutex = new Mutex()
  let handover: DraftHandover | undefined

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

  function windowsFor(mode: ChatWindowMode) {
    return mode === 'floating'
      ? { next: params.floating, previous: params.legacy }
      : { next: params.legacy, previous: params.floating }
  }

  async function switchWindows(mode: ChatWindowMode) {
    const previousMode = params.getMode()
    if (mode === previousMode)
      return

    const { next, previous } = windowsFor(mode)
    const draft = await previous.collectDraft()
    const settled = Promise.withResolvers<boolean>()
    handover = { target: mode, draft, settle: settled.resolve }
    params.setMode(mode)

    try {
      await next.open()
      if (!await withTimeout(() => settled.promise, handoverTimeout))
        throw new Error('The new chat window could not restore the draft')
    }
    catch (error) {
      next.close()
      params.setMode(previousMode)
      throw error
    }
    finally {
      handover = undefined
    }

    previous.close()
  }

  return {
    run,
    /**
     * Shows the window of the saved mode, for a caller that does not change
     * the mode. The other mode's window is already closed, so no draft moves.
     */
    show: () => run(async () => {
      const { next, previous } = windowsFor(params.getMode())
      await next.open()
      previous.close()
    }),
    /** Saves `mode` and swaps the open window, carrying the draft over. */
    switchTo: (mode: ChatWindowMode) => run(() => switchWindows(mode)),
    /** The draft for a window of `mode` while a switch opens it, otherwise `undefined`. */
    takeDraft: (mode: ChatWindowMode) => handover?.target === mode ? handover.draft : undefined,
    /** Records whether a window of `mode` restored its draft; ignored for any other window. */
    settleDraft: (mode: ChatWindowMode, restored: boolean) => {
      if (handover?.target === mode)
        handover.settle(restored)
    },
  }
}
