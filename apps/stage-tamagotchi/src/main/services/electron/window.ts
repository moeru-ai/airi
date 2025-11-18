import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'

import { bounds, startLoopGetBounds } from '../../../shared/electron/window'
import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { useLoop } from '../../libs/event-loop'

export function createWindowService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { start, stop } = useLoop(() => {
    if (params.window.isDestroyed()) {
      return
    }

    params.context.emit(bounds, params.window.getBounds())
  }, {
    autoStart: false,
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  defineInvokeHandler(params.context, startLoopGetBounds, () => start())

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
  defineInvokeHandler(params.context, electron.window.setIgnoreMouseEvents, (opts, options) => {
    if (params.window.webContents.id === options?.raw.ipcMainEvent.sender.id) {
      params.window.setIgnoreMouseEvents(...opts)
    }
  })
}
