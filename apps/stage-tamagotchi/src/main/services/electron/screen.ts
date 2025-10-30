import type { createContext } from '@unbird/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@unbird/eventa'
import { screen } from 'electron'

import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '../../../shared/electron/screen'
import { electron } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { useLoop } from '../../libs/event-loop'

export function createScreenService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { start, stop } = useLoop(() => {
    const dipPos = screen.getCursorScreenPoint()
    params.context.emit(cursorScreenPoint, dipPos)
  }, {
    autoStart: false,
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  defineInvokeHandler(params.context, startLoopGetCursorScreenPoint, () => start())

  defineInvokeHandler(params.context, electron.screen.getAllDisplays, () => screen.getAllDisplays())
  defineInvokeHandler(params.context, electron.screen.getPrimaryDisplay, () => screen.getPrimaryDisplay())
  defineInvokeHandler(params.context, electron.screen.dipToScreenPoint, point => screen.dipToScreenPoint(point))
  defineInvokeHandler(params.context, electron.screen.dipToScreenRect, rect => screen.dipToScreenRect(params.window, rect))
  defineInvokeHandler(params.context, electron.screen.screenToDipPoint, point => screen.screenToDipPoint(point))
  defineInvokeHandler(params.context, electron.screen.screenToDipRect, rect => screen.screenToDipRect(params.window, rect))
  defineInvokeHandler(params.context, electron.screen.getCursorScreenPoint, () => screen.getCursorScreenPoint())
}
