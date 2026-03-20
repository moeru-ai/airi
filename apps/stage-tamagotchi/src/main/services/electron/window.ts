import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { bounds, startLoopGetBounds } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'

import { electron, electronWindowClose, electronWindowHide, electronWindowSetAlwaysOnTop } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { resizeWindowByDelta } from '../../windows/shared/window'

export function createWindowService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      if (params.window.isDestroyed())
        return

      params.context.emit(bounds, params.window.getBounds())
    },
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  const cleanup = () => stop()
  params.window.on('close', cleanup)
  params.window.on('closed', cleanup)

  defineInvokeHandler(params.context, startLoopGetBounds, () => start())

  defineInvokeHandler(params.context, electron.window.getBounds, (_, options) => {
    if (params.window.isDestroyed())
      return

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
    if (params.window.isDestroyed())
      return

    if (newBounds && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setBounds(newBounds[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.setIgnoreMouseEvents, (opts, options) => {
    if (params.window.isDestroyed())
      return

    if (opts && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setIgnoreMouseEvents(...opts)
    }
  })

  defineInvokeHandler(params.context, electronWindowSetAlwaysOnTop, (flag, options) => {
    if (params.window.isDestroyed())
      return

    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      if (flag) {
        params.window.setAlwaysOnTop(true, 'screen-saver', 1)
      }
      else {
        params.window.setAlwaysOnTop(false)
      }
    }
  })

  defineInvokeHandler(params.context, electron.window.setVibrancy, (vibrancy, options) => {
    if (params.window.isDestroyed())
      return

    if (vibrancy && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setVibrancy(vibrancy[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.setBackgroundMaterial, (backgroundMaterial, options) => {
    if (params.window.isDestroyed())
      return

    if (backgroundMaterial && params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setBackgroundMaterial(backgroundMaterial[0])
    }
  })

  defineInvokeHandler(params.context, electron.window.resize, (payload, options) => {
    if (params.window.isDestroyed())
      return

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
    if (params.window.isDestroyed())
      return

    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.close()
    }
  })

  defineInvokeHandler(params.context, electronWindowHide, (_, options) => {
    if (params.window.isDestroyed())
      return

    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.hide()
    }
  })

  return cleanup
}
