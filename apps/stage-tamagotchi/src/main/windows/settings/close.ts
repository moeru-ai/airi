import type { BrowserWindow } from 'electron'

import { errorMessageFrom } from '@moeru/std'

/**
 * Holds normal window close requests until the renderer saves its settings.
 * Repeated requests share one flush. A failed flush leaves the window open and
 * permits a later close request to retry. A destroyed window cannot be resumed.
 */
export function deferSettingsWindowClose(
  window: Pick<BrowserWindow, 'on' | 'close' | 'isDestroyed'>,
  flush: () => Promise<void>,
) {
  let closing = false
  let saved = false

  /**
   * Triggering workflow:
   * BrowserWindow `close` -> flush renderer settings -> BrowserWindow.close.
   * The second close passes through only after the save barrier resolves.
   */
  window.on('close', async (event) => {
    if (saved)
      return

    event.preventDefault()
    if (closing)
      return

    closing = true
    try {
      await flush()
      if (window.isDestroyed())
        return

      saved = true
      window.close()
      // Another close handler can cancel the second request.
      saved = false
    }
    catch (error) {
      console.error('Failed to save settings before closing:', errorMessageFrom(error))
    }
    finally {
      closing = false
    }
  })
}
