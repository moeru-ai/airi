import { defineEventa, defineInvokeEventa } from '@unbird/eventa'

// TODO: currently, if we use `/shared` path, both web & node tsconfig.json
// will include, while web gets higher priority in including files, this results
// in type error for `electron` module, even for type only import, here the
// `Point` interface cannot be imported directly due to this reason.
//
// We have to find a better way (better without sub-package) to share code between
// main & preload & renderer process.
interface Point {
  // Docs: https://electronjs.org/docs/api/structures/point
  x: number
  y: number
}

export const electronCursorPoint = defineEventa<Point>('electron:eventa:event:cursor-point')
export const electronStartTrackingCursorPoint = defineInvokeEventa('electron:eventa:invoke:start-tracking-cursor-point')
export const electronOpenMainDevtools = defineInvokeEventa<void, void>('electron:eventa:invoke:windows:main:devtools:open')
export const electronOpenSettings = defineInvokeEventa<void, void>('electron:eventa:invoke:windows:settings:open')
export const electronOpenSettingsDevtools = defineInvokeEventa<void, void>('electron:eventa:invoke:windows:settings:devtools:open')
