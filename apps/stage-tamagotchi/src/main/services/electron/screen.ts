import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { createRendererLoop } from '@proj-airi/electron-vueuse/main'
import { screen } from 'electron'

import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'

export function createScreenService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  // The loop ticks 60 times a second but the cursor rarely moves, and each message costs the renderer
  // a deserialize plus a synthesized MouseEvent. The 1s re-emit exists because consumers learn the
  // position only from this event, so one mounting mid-idle would otherwise hold nothing.
  const RESEND_INTERVAL_MS = 1000
  let lastPoint: { x: number, y: number } | undefined
  let lastEmittedAt = 0

  const { start, stop } = createRendererLoop({
    window: params.window,
    run: () => {
      const dipPos = screen.getCursorScreenPoint()
      const now = Date.now()
      const moved = !lastPoint || lastPoint.x !== dipPos.x || lastPoint.y !== dipPos.y
      if (!moved && now - lastEmittedAt < RESEND_INTERVAL_MS)
        return

      lastPoint = { x: dipPos.x, y: dipPos.y }
      lastEmittedAt = now
      params.context.emit(cursorScreenPoint, dipPos)
    },
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  defineInvokeHandler(params.context, startLoopGetCursorScreenPoint, () => start())

  defineInvokeHandler(params.context, electron.screen.getAllDisplays, () => screen.getAllDisplays())
  defineInvokeHandler(params.context, electron.screen.getPrimaryDisplay, () => screen.getPrimaryDisplay())
  defineInvokeHandler(params.context, electron.screen.dipToScreenPoint, point => point ? screen.dipToScreenPoint(point) : screen.getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.dipToScreenRect, rect => rect ? screen.dipToScreenRect(params.window, rect) : params.window.getBounds())
  defineInvokeHandler(params.context, electron.screen.screenToDipPoint, point => point ? screen.screenToDipPoint(point) : screen.getCursorScreenPoint())
  defineInvokeHandler(params.context, electron.screen.screenToDipRect, rect => rect ? screen.screenToDipRect(params.window, rect) : params.window.getBounds())
  defineInvokeHandler(params.context, electron.screen.getCursorScreenPoint, () => screen.getCursorScreenPoint())
}
