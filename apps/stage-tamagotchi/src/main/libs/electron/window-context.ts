import type { BrowserWindow } from 'electron'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

/**
 * Creates the Eventa context that serves the renderer of one window.
 *
 * All windows share one `ipcMain`. A context without `onlySameWindow` hears the IPC of every window. Then one invoke
 * runs once in each window that registered the handler, and each copy answers its own window. The context from this
 * function hears only IPC from `window`, so one invoke runs one handler.
 *
 * Events that the main process emits on the context still go to `window`. A service that pushes state to each window
 * keeps one context per window. A request that is not about one window can use a context without a window instead,
 * because that context answers the sender.
 *
 * The context disposes when the window closes. It aborts pending invokes and removes its `ipcMain` listeners.
 *
 * @param window A live window. Eventa throws a `TypeError` if the window or its `webContents` is destroyed.
 */
export function createWindowContext(window: BrowserWindow) {
  return createContext(ipcMain, window, { onlySameWindow: true })
}
