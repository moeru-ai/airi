import type { BrowserWindow } from 'electron'

import { isRendererUnavailable } from '@proj-airi/electron-vueuse/main'

export function createReusableWindow(setupFn: () => BrowserWindow | Promise<BrowserWindow>): { getWindow: () => Promise<BrowserWindow> } {
  let window: BrowserWindow | undefined
  let windowSetupFnPromise: Promise<BrowserWindow> | undefined

  const ensureWindow = async () => {
    if (window && !isRendererUnavailable(window))
      return window

    if (windowSetupFnPromise)
      return windowSetupFnPromise

    windowSetupFnPromise = Promise.resolve(setupFn()).then((created) => {
      window = created
      windowSetupFnPromise = undefined

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
  }
}
