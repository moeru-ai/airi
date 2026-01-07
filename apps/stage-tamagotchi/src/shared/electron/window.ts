import type { BrowserWindow, Rectangle } from 'electron'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const bounds = defineEventa<Rectangle>('eventa:event:electron:window:bounds')
export const startLoopGetBounds = defineInvokeEventa('eventa:event:electron:window:start-loop-get-bounds')

const getBounds = defineInvokeEventa<ReturnType<BrowserWindow['getBounds']>>('eventa:invoke:electron:window:get-bounds')
const setIgnoreMouseEvents = defineInvokeEventa<void, [boolean, { forward: boolean }]>('eventa:invoke:electron:window:set-ignore-mouse-events')
const setVibrancy = defineInvokeEventa<void, Parameters<BrowserWindow['setVibrancy']>>('eventa:invoke:electron:window:set-vibrancy')
const setBackgroundMaterial = defineInvokeEventa<void, Parameters<BrowserWindow['setBackgroundMaterial']>>('eventa:invoke:electron:window:set-background-material')

export type VibrancyType = Parameters<BrowserWindow['setVibrancy']>[0]
export type BackgroundMaterialType = Parameters<BrowserWindow['setBackgroundMaterial']>[0]

export const window = {
  getBounds,
  setIgnoreMouseEvents,
  setVibrancy,
  setBackgroundMaterial,
}
