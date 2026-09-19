import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { ElectronWindowLifecycleState } from '../../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { bounds, startLoopGetBounds } from '@proj-airi/electron-eventa'
import { createRendererLoop, safeClose } from '@proj-airi/electron-vueuse/main'
import { isWindows } from 'std-env'

import {
  electron,
  electronGetWindowLifecycleState,
  electronWindowClose,
  electronWindowLifecycleChanged,
  electronWindowSetAlwaysOnTop,
} from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { resizeWindowByDelta, setWindowAlwaysOnTop } from '../../windows/shared/window'

export function createWindowService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  function getWindowLifecycleState(reason: ElectronWindowLifecycleState['reason']): ElectronWindowLifecycleState {
    return {
      focused: params.window.isFocused(),
      minimized: params.window.isMinimized(),
      reason,
      updatedAt: Date.now(),
      visible: params.window.isVisible(),
    }
  }

  function emitWindowLifecycle(reason: ElectronWindowLifecycleState['reason']) {
    params.context.emit(electronWindowLifecycleChanged, getWindowLifecycleState(reason))
  }

  // Same reasoning as the cursor loop in ./screen: window bounds change rarely, yet re-emitting them
  // 60 times a second cost the renderer an IPC message and a reactive write for identical values. The
  // periodic re-emit keeps a subscriber that mounts between moves from holding a stale rectangle.
  const BOUNDS_RESEND_INTERVAL_MS = 1000
  let lastBounds: { x: number, y: number, width: number, height: number } | undefined
  let lastBoundsEmittedAt = 0

  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      const next = params.window.getBounds()
      const now = Date.now()
      const changed = !lastBounds
        || lastBounds.x !== next.x
        || lastBounds.y !== next.y
        || lastBounds.width !== next.width
        || lastBounds.height !== next.height
      if (!changed && now - lastBoundsEmittedAt < BOUNDS_RESEND_INTERVAL_MS)
        return

      lastBounds = { x: next.x, y: next.y, width: next.width, height: next.height }
      lastBoundsEmittedAt = now
      params.context.emit(bounds, next)
    },
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  defineInvokeHandler(params.context, startLoopGetBounds, () => start())
  defineInvokeHandler(params.context, electronGetWindowLifecycleState, (_, options) => {
    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id)
      return getWindowLifecycleState('snapshot')
  })

  params.window.on('show', () => emitWindowLifecycle('show'))
  params.window.on('hide', () => emitWindowLifecycle('hide'))
  params.window.on('minimize', () => emitWindowLifecycle('minimize'))
  params.window.on('restore', () => emitWindowLifecycle('restore'))
  params.window.on('focus', () => emitWindowLifecycle('focus'))
  params.window.on('blur', () => emitWindowLifecycle('blur'))

  defineInvokeHandler(params.context, electron.window.getBounds, (_, options) => {
    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      return params.window.getBounds()
    }

    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  })

  defineInvokeHandler(params.context, electron.window.setBounds, (newBounds, options) => {
    if (newBounds && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setBounds(newBounds[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.setIgnoreMouseEvents, (opts, options) => {
    if (opts && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setIgnoreMouseEvents(...opts)
    }
  })

  defineInvokeHandler(params.context, electronWindowSetAlwaysOnTop, (flag, options) => {
    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      setWindowAlwaysOnTop(params.window, Boolean(flag))
    }
  })

  defineInvokeHandler(params.context, electron.window.setVibrancy, (vibrancy, options) => {
    if (vibrancy && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setVibrancy(vibrancy[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.setBackgroundMaterial, (backgroundMaterial, options) => {
    if (isWindows && backgroundMaterial && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setBackgroundMaterial(backgroundMaterial[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.resize, (payload, options) => {
    if (!payload || params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    resizeWindowByDelta({
      window: params.window,
      deltaX: payload.deltaX,
      deltaY: payload.deltaY,
      direction: payload.direction,
    })
  })

  defineInvokeHandler(params.context, electronWindowClose, (_, options) => {
    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      safeClose(params.window)
    }
  })
}
