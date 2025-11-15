import type { BrowserWindow, Rectangle } from 'electron'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const bounds = defineEventa<Rectangle>('eventa:event:electron:window:bounds')
export const startLoopGetBounds = defineInvokeEventa('eventa:event:electron:window:start-loop-get-bounds')

const getBounds = defineInvokeEventa<ReturnType<BrowserWindow['getBounds']>>('eventa:invoke:electron:window:get-bounds')
const setIgnoreMouseEvents = defineInvokeEventa<void, [boolean, { forward: boolean }]>('eventa:invoke:electron:window:set-ignore-mouse-events')

export const window = {
  getBounds,
  setIgnoreMouseEvents,
}
