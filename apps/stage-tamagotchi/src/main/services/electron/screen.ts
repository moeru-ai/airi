import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'
import { screen } from 'electron'

import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { getKWinCursorBridge } from './kwin-cursor-bridge'

export function createScreenService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      const dipPos = getCursorScreenPoint()
      params.context.emit(cursorScreenPoint, dipPos)
    },
  })

  // The loop stops with its window; these cover the app closing first.
  const offAllClosed = onAppWindowAllClosed(() => stop())
  const offBeforeQuit = onAppBeforeQuit(() => stop())
  params.window.once('closed', () => {
    offAllClosed()
    offBeforeQuit()
  })
  defineInvokeHandler(params.context, startLoopGetCursorScreenPoint, () => start())

  defineInvokeHandler(params.context, electron.screen.getAllDisplays, () => screen.getAllDisplays())
  defineInvokeHandler(params.context, electron.screen.getPrimaryDisplay, () => screen.getPrimaryDisplay())
  defineInvokeHandler(params.context, electron.screen.dipToScreenPoint, point => point ? screen.dipToScreenPoint(point) : getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.dipToScreenRect, rect => rect ? screen.dipToScreenRect(params.window, rect) : getWindowBounds(params.window))
  defineInvokeHandler(params.context, electron.screen.screenToDipPoint, point => point ? screen.screenToDipPoint(point) : getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.screenToDipRect, rect => rect ? screen.screenToDipRect(params.window, rect) : getWindowBounds(params.window))
  defineInvokeHandler(params.context, electron.screen.getCursorScreenPoint, () => getCursorScreenPoint())
}

function getCursorScreenPoint() {
  return getKWinCursorBridge()?.getCursorScreenPoint() ?? screen.getCursorScreenPoint()
}

function getWindowBounds(window: BrowserWindow) {
  return getKWinCursorBridge()?.getWindowBounds(window.getTitle()) ?? window.getBounds()
}
