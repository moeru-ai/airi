import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { windowDock } from '..'
import { DockController } from './controller'
import { createPlatformWindowTracker } from './native'

export interface WindowDockOptions {
  /**
   * Creates the overlay window that shows AIRI over the target window.
   *
   * Dock Mode calls it on the first start of a session, and destroys the window when the session ends.
   * The window must be hidden, transparent, and not focusable. Load its page before the promise resolves.
   *
   * If the creation takes longer than 30 s, Dock Mode aborts `signal` and the start fails.
   * On the abort, destroy the window. Dock Mode destroys a window that the promise gives after the abort.
   */
  createOverlayWindow: (signal: AbortSignal) => Promise<BrowserWindow>
}

export interface WindowDock {
  /** Removes the IPC handlers, ends the dock session, and destroys the overlay window. */
  dispose: () => void
}

/**
 * Sets up Dock Mode in the Electron main process and registers the `windowDock` invoke handlers.
 * Call it one time. Call `dispose` when the app quits.
 */
export function setupWindowDock(options: WindowDockOptions): WindowDock {
  /**
   * The Eventa context of the current overlay window. It sends `windowDock.configChanged` to the overlay renderer.
   * The window-less context below cannot do this, because it sends only replies to the sender of an invoke.
   * With `onlySameWindow`, the context disposes itself when its window closes.
   */
  let overlayContext: ReturnType<typeof createContext>['context'] | undefined

  const controller = new DockController({
    createOverlayWindow: async (signal) => {
      const window = await options.createOverlayWindow(signal)
      connectOverlay(window)
      return window
    },
    tracker: createPlatformWindowTracker(),
  })

  function connectOverlay(window: BrowserWindow) {
    // The controller destroys a window that it cannot use. A destroyed window gets no context.
    if (window.isDestroyed()) {
      return
    }

    const connection = createContext(ipcMain, window, { onlySameWindow: true }).context
    overlayContext = connection
    window.once('closed', () => {
      if (overlayContext === connection) {
        overlayContext = undefined
      }
    })
    // The overlay page is loaded at this point, so its listener exists.
    connection.emit(windowDock.configChanged, controller.getConfig())
  }

  // A context without a window hears every renderer and replies to the sender.
  // The devtools page in the settings window controls the dock through it.
  const { context, dispose: disposeContext } = createContext(ipcMain)

  defineInvokeHandler(context, windowDock.listTargets, () => controller.listTargets())
  defineInvokeHandler(context, windowDock.start, ({ targetId }) => controller.start(targetId))
  defineInvokeHandler(context, windowDock.stop, () => controller.stop())
  defineInvokeHandler(context, windowDock.getDebugState, () => controller.getDebugState())
  defineInvokeHandler(context, windowDock.getConfig, () => controller.getConfig())
  defineInvokeHandler(context, windowDock.setConfig, (config) => {
    // An invalid update throws here, so the overlay hears only a config that the controller accepted.
    const state = controller.updateConfig(config)
    overlayContext?.emit(windowDock.configChanged, controller.getConfig())
    return state
  })

  return {
    dispose() {
      disposeContext()
      controller.dispose()
    },
  }
}
