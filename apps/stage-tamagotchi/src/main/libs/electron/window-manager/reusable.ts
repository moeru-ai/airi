import type { BrowserWindow } from 'electron'

export function createReusableWindow(setupFn: () => BrowserWindow | Promise<BrowserWindow>): { getWindow: () => Promise<BrowserWindow> } {
  let window: BrowserWindow | undefined

  return {
    getWindow: async () => {
      if (!window) {
        window = await setupFn()
        return window
      }
      if (window.isDestroyed()) {
        window = await setupFn()
        return window
      }

      return window
    },
  }
}
