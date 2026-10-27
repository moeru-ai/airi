import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, Point } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'
import { screen } from 'electron'

import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'

export function createScreenService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  // The last position that the renderer received. The renderer keeps it, so a cursor that did not move needs no
  // message. Each message costs the renderer an IPC dispatch on its main thread, where the Stage renders.
  let sent: Point | undefined
  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      const dipPos = screen.getCursorScreenPoint()
      if (sent?.x === dipPos.x && sent?.y === dipPos.y)
        return
      sent = dipPos
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
  // A reloaded renderer starts the loop again with no position, so the next tick sends the position even if it did not change.
  defineInvokeHandler(params.context, startLoopGetCursorScreenPoint, () => {
    sent = undefined
    start()
  })

  defineInvokeHandler(params.context, electron.screen.getAllDisplays, () => screen.getAllDisplays())
  defineInvokeHandler(params.context, electron.screen.getPrimaryDisplay, () => screen.getPrimaryDisplay())
  defineInvokeHandler(params.context, electron.screen.dipToScreenPoint, point => point ? screen.dipToScreenPoint(point) : screen.getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.dipToScreenRect, rect => rect ? screen.dipToScreenRect(params.window, rect) : params.window.getBounds())
  defineInvokeHandler(params.context, electron.screen.screenToDipPoint, point => point ? screen.screenToDipPoint(point) : screen.getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.screenToDipRect, rect => rect ? screen.screenToDipRect(params.window, rect) : params.window.getBounds())
  defineInvokeHandler(params.context, electron.screen.getCursorScreenPoint, () => screen.getCursorScreenPoint())
}
