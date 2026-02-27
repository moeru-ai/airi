import type { Display, screen as electronScreen, Point } from 'electron'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const cursorScreenPoint = defineEventa<Point>('eventa:event:electron:screen:cursor-screen-point')
export const startLoopGetCursorScreenPoint = defineInvokeEventa('eventa:event:electron:screen:start-loop-get-cursor-screen-point')

const getAllDisplays = defineInvokeEventa<Display[]>('eventa:invoke:electron:screen:get-all-displays')
const getPrimaryDisplay = defineInvokeEventa<Display>('eventa:invoke:electron:screen:get-primary-display')
const getCursorScreenPoint = defineInvokeEventa<ReturnType<typeof electronScreen.getCursorScreenPoint>>('eventa:invoke:electron:screen:get-cursor-screen-point')
const dipToScreenPoint = defineInvokeEventa<ReturnType<typeof electronScreen.dipToScreenPoint>, Parameters<typeof electronScreen.dipToScreenPoint>[0]>('eventa:invoke:electron:screen:dip-to-screen-point')
const dipToScreenRect = defineInvokeEventa<ReturnType<typeof electronScreen.dipToScreenRect>, Parameters<typeof electronScreen.dipToScreenRect>[1]>('eventa:invoke:electron:screen:dip-to-screen-rect')
const screenToDipPoint = defineInvokeEventa<ReturnType<typeof electronScreen.screenToDipPoint>, Parameters<typeof electronScreen.screenToDipPoint>[0]>('eventa:invoke:electron:screen:screen-to-dip-point')
const screenToDipRect = defineInvokeEventa<ReturnType<typeof electronScreen.screenToDipRect>, Parameters<typeof electronScreen.screenToDipRect>[1]>('eventa:invoke:electron:screen:screen-to-dip-rect')

export const screen = {
  getAllDisplays,
  getPrimaryDisplay,
  getCursorScreenPoint,
  dipToScreenPoint,
  dipToScreenRect,
  screenToDipPoint,
  screenToDipRect,
}
