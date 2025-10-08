import type { createContext } from '@unbird/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@unbird/eventa'
import { screen } from 'electron'

import { electronCursorPoint, electronStartTrackingCursorPoint } from '../../../shared/eventa'
import { onAppBeforeQuit, onAppWindowAllClosed } from '../../libs/bootkit/lifecycle'
import { useLoop } from '../../libs/event-loop'

export function createFadeOnHoverService(context: ReturnType<typeof createContext>['context']) {
  const { start, stop } = useLoop(() => {
    const dipPos = screen.getCursorScreenPoint()
    context.emit(electronCursorPoint, dipPos)
  }, {
    autoStart: false,
  })

  onAppWindowAllClosed(() => stop())
  onAppBeforeQuit(() => stop())
  defineInvokeHandler(context, electronStartTrackingCursorPoint, () => start())
}
