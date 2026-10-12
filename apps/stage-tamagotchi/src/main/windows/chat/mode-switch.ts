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
  /**
   * `true` when the window shows only the chat, so it closes once the chat is in another mode. A mode that shows
   * the chat inside a window with other content sets `false`, and that window closes only when a switch leaves it.
   */
  ownsWindow: boolean
  /** Whether the chat of this mode is open now, shown or hidden. */
  isOpen: () => boolean
  /** Shows the chat in this mode, creating the window when needed. */
  open: () => Promise<void>
  /**
   * Tells the page of the open window that a switch carries a draft to it. A page that has not mounted yet misses
   * it, and takes the draft when it mounts.
   */
  offerDraft: () => void
  /** Closes the window of this mode, including one that is still being created. */
  close: () => void
  /**
   * The conversation and unsent draft of this mode's window, or `undefined`
   * when the window is closed or shows no conversation. Rejects when the
   * window cannot answer.
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
  /** Whether the target window took the draft. Its report counts only after that. */
  taken: boolean
  settle: (restored: boolean) => void
}

/**
 * Moves the chat between the windows of the chat modes, without losing the
 * unsent draft on a switch.
 *
 * Every piece of chat window work runs one at a time. A switch starts from the
 * window where the user chose the mode. That window is not always the window
 * of the saved mode, because a window that does not own itself can show the
 * chat in any mode. A switch then runs as one transaction:
 *
 * 1. Collect the draft from the window that asks.
 * 2. Save the new mode and open its window.
 * 3. Wait until the new window has put the draft back.
 * 4. Close the window that asked, and every other window that only shows the chat.
 *
 * A failure at any step restores the saved mode, and closes the new window
 * unless it was open before. The window that asked was not closed, so it still
 * holds the draft.
 */
export function createChatModeSwitch(params: {
  getMode: () => ChatWindowMode
  setMode: (mode: ChatWindowMode) => void
  /** The window of each chat mode. */
  windows: Record<ChatWindowMode, ChatModeWindow>
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

  /** Closes the windows that only show the chat, and `left`, the window that a switch leaves. The window of `mode` stays. */
  function closeOtherWindows(mode: ChatWindowMode, left?: ChatModeWindow) {
    for (const [other, window] of Object.entries(params.windows)) {
      if (other !== mode && (window.ownsWindow || window === left))
        window.close()
    }
  }

  async function switchWindows(mode: ChatWindowMode, from: ChatWindowMode) {
    if (mode === from)
      return

    const next = params.windows[mode]
    const previous = params.windows[from]
    const savedMode = params.getMode()
    const draft = await previous.collectDraft()
    const settled = Promise.withResolvers<boolean>()
    handover = { target: mode, draft, taken: false, settle: settled.resolve }
    const wasOpen = next.isOpen()
    params.setMode(mode)

    try {
      await next.open()
      next.offerDraft()
      if (!await withTimeout(() => settled.promise, handoverTimeout))
        throw new Error('The new chat window could not restore the draft')
    }
    catch (error) {
      // The switch closes only a window that it opened.
      if (!wasOpen)
        next.close()
      params.setMode(savedMode)
      throw error
    }
    finally {
      handover = undefined
    }

    closeOtherWindows(mode, previous)
  }

  return {
    run,
    /**
     * Shows the window of the saved mode, for a caller that does not change
     * the mode. No draft moves. A window that shows the chat beside other
     * content stays as it is.
     */
    show: () => run(async () => {
      const mode = params.getMode()
      await params.windows[mode].open()
      closeOtherWindows(mode)
    }),
    /**
     * Saves `mode` and moves the chat from the window of `from`, where the
     * user chose it, to the window of `mode`. The draft goes with it.
     */
    switchTo: (mode: ChatWindowMode, from: ChatWindowMode) => run(() => switchWindows(mode, from)),
    /** The draft for a window of `mode` while a switch opens it, otherwise `undefined`. */
    takeDraft: (mode: ChatWindowMode) => {
      if (handover?.target !== mode)
        return undefined
      handover.taken = true
      return handover.draft
    },
    /**
     * Records whether a window of `mode` restored its draft. A report from any other window is ignored, and so is a
     * report from a take that came before the switch, such as the take of a page that mounted earlier.
     */
    settleDraft: (mode: ChatWindowMode, restored: boolean) => {
      if (handover?.target === mode && handover.taken)
        handover.settle(restored)
    },
  }
}
