import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { ElectronWindowLifecycleState } from '../../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { bounds, startLoopGetBounds } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'

import {
  electron,
  electronGetWindowLifecycleState,
  electronWindowClose,
  electronWindowLifecycleChanged,
} from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { resizeWindowByDelta } from '../../windows/shared/window'

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

  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      params.context.emit(bounds, params.window.getBounds())
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

  defineInvokeHandler(params.context, electron.window.setVibrancy, (vibrancy, options) => {
    if (vibrancy && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setVibrancy(vibrancy[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.setBackgroundMaterial, (backgroundMaterial, options) => {
    if (backgroundMaterial && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
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
      params.window.close()
    }
  })
}
