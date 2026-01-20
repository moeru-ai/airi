import type { BrowserWindow } from 'electron'

import type { DockConfig, StartDockRequest } from '..'
import type { WindowTracker } from './window-tracker'

import process from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'

import { windowDock } from '..'
import { DockController } from './controller'
import { getOverlayWindowIds } from './window-ids'
import { createPlatformWindowTracker } from './window-tracker'

export interface InitMainOptions {
  tracker?: WindowTracker
  config?: DockConfig
}

export interface InitWindowOptions {
  overlayWindow?: BrowserWindow
  tracker?: WindowTracker
  config?: DockConfig
}

const controllers = new WeakMap<BrowserWindow, DockController>()
let initMainCalled = false
let sharedTracker: WindowTracker | undefined
let sharedConfig: DockConfig | undefined

export function initWindowDockForMain(options: InitMainOptions = {}): void {
  if (initMainCalled) {
    return
  }
  initMainCalled = true
  sharedConfig = options.config
  sharedTracker = options.tracker ?? createPlatformWindowTracker()
}

export function initWindowDockForWindow(window: BrowserWindow, options: InitWindowOptions = {}): void {
  if (!initMainCalled) {
    throw new Error('initWindowDockForMain must be called before initWindowDockForWindow')
  }

  if (controllers.has(window)) {
    return
  }

  const tracker = options.tracker ?? sharedTracker ?? createPlatformWindowTracker()
  const overlayWindow = options.overlayWindow ?? window
  const overlayIsSameWindow = overlayWindow === window
  const overlayIds = getOverlayWindowIds({
    electronId: overlayWindow.id,
    nativeHandle: process.platform === 'win32' ? overlayWindow.getNativeWindowHandle() : undefined,
  })
  const overlayIdSet = new Set(overlayIds)
  const overlayTitle = overlayWindow.getTitle()

  const controller = new DockController({
    overlayWindow: options.overlayWindow ?? window,
    overlayIds,
    tracker,
    config: { ...sharedConfig, ...options.config },
  })

  controllers.set(window, controller)

  // Allow devtools/settings windows to reach the dock controller by replying to the caller, not just the overlay window.
  const { context } = createContext(ipcMain)

  const cleanups = [
    defineInvokeHandler(context, windowDock.listTargets, async () => {
      const windows = await tracker.listWindows()
      return windows.filter((candidate) => {
        const isOverlayById = overlayIdSet.has(candidate.id)
        const isOverlayByTitle = !overlayIsSameWindow && candidate.ownerPid === process.pid && candidate.title === overlayTitle
        return !isOverlayById && !isOverlayByTitle
      })
    }),
    defineInvokeHandler(context, windowDock.start, async (payload: StartDockRequest) => {
      return controller.start(payload.targetId)
    }),
    defineInvokeHandler(context, windowDock.stop, async () => controller.stop()),
    defineInvokeHandler(context, windowDock.getDebugState, async () => controller.getDebugState()),
    defineInvokeHandler(context, windowDock.setConfig, async config => controller.updateConfig(config)),
  ]

  window.on('closed', () => {
    controller.dispose()
    controllers.delete(window)
    for (const dispose of cleanups) {
      dispose()
    }
  })
}
