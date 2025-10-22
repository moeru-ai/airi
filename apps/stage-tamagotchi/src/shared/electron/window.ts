import type { BrowserWindow, Rectangle } from 'electron'

import { defineEventa, defineInvokeEventa } from '@unbird/eventa'

export const bounds = defineEventa<Rectangle>('eventa:event:electron:window:bounds')
export const startLoopGetBounds = defineInvokeEventa('eventa:event:electron:window:start-loop-get-bounds')

const getBounds = defineInvokeEventa<ReturnType<BrowserWindow['getBounds']>>('eventa:invoke:electron:window:get-bounds')

export const window = {
  getBounds,
}
