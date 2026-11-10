import type { BrowserWindow } from 'electron'

import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'

/** One window that is created on demand and created again after it closes. */
export interface ReusableWindow {
  /** Returns the open window, creating it first when there is none. */
  getWindow: () => Promise<BrowserWindow>
  /** Returns the open window without creating one. */
  getOpenWindow: () => BrowserWindow | undefined
  /**
   * Closes the open window. A window that is still being created closes as
   * soon as its setup finishes, and callers waiting for it get the error
   * `Window closed during creation`.
   */
  close: () => void
}

export function createReusableWindow(setupFn: () => BrowserWindow | Promise<BrowserWindow>): ReusableWindow {
  let window: BrowserWindow | undefined
  let windowSetupFnPromise: Promise<BrowserWindow> | undefined
  // Counts close() calls, so a creation that a close overtook knows to discard
  // its window instead of handing it out.
  let generation = 0

  const ensureWindow = async () => {
    if (window && !isRendererUnavailable(window))
      return window

    if (windowSetupFnPromise)
      return windowSetupFnPromise

    const setupGeneration = generation
    windowSetupFnPromise = Promise.resolve(setupFn()).then((created) => {
      windowSetupFnPromise = undefined
      if (setupGeneration !== generation) {
        created.close()
        throw new Error('Window closed during creation')
      }

      window = created
      created.on?.('closed', () => {
        if (window === created)
          window = undefined
      })

      return created
    }).catch((error) => {
      windowSetupFnPromise = undefined
      throw error
    })

    return windowSetupFnPromise
  }

  return {
    getWindow: async () => ensureWindow(),
    getOpenWindow: () => window && !window.isDestroyed() ? window : undefined,
    close: () => {
      generation++
      if (window && !window.isDestroyed())
        window.close()
    },
  }
}
