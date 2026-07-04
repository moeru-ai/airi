import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const cursorScreenPoint = defineEventa<{ x: number; y: number }>(
  'eventa:event:electron:screen:cursor-screen-point',
)
export const startLoopGetCursorScreenPoint = defineInvokeEventa(
  'eventa:event:electron:screen:start-loop-get-cursor-screen-point',
)

const getAllDisplays = defineInvokeEventa<any[]>('eventa:invoke:electron:screen:get-all-displays')
const getPrimaryDisplay = defineInvokeEventa<any>('eventa:invoke:electron:screen:get-primary-display')
const getCursorScreenPoint = defineInvokeEventa<{ x: number; y: number }>(
  'eventa:invoke:electron:screen:get-cursor-screen-point',
)
const dipToScreenPoint = defineInvokeEventa<any, [any]>('eventa:invoke:electron:screen:dip-to-screen-point')
const dipToScreenRect = defineInvokeEventa<any, [any]>('eventa:invoke:electron:screen:dip-to-screen-rect')
const screenToDipPoint = defineInvokeEventa<any, [any]>('eventa:invoke:electron:screen:screen-to-dip-point')
const screenToDipRect = defineInvokeEventa<any, [any]>('eventa:invoke:electron:screen:screen-to-dip-rect')

export const screen = {
  getAllDisplays,
  getPrimaryDisplay,
  getCursorScreenPoint,
  dipToScreenPoint,
  dipToScreenRect,
  screenToDipPoint,
  screenToDipRect,
}
