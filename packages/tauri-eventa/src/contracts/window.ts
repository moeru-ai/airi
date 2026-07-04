import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const bounds = defineEventa<{ x: number; y: number; width: number; height: number }>(
  'eventa:event:electron:window:bounds',
)
export const electronWindowLifecycleChanged = defineEventa<ElectronWindowLifecycleState>(
  'eventa:event:electron:window:lifecycle-changed',
)
export const startLoopGetBounds = defineInvokeEventa('eventa:event:electron:window:start-loop-get-bounds')

const getBounds = defineInvokeEventa<{ x: number; y: number; width: number; height: number }>(
  'eventa:invoke:electron:window:get-bounds',
)
export const electronGetWindowLifecycleState = defineInvokeEventa<ElectronWindowLifecycleState>(
  'eventa:invoke:electron:window:get-lifecycle-state',
)
const setBounds = defineInvokeEventa<void, [any]>('eventa:invoke:electron:window:set-bounds')
const setIgnoreMouseEvents = defineInvokeEventa<void, [boolean]>(
  'eventa:invoke:electron:window:set-ignore-mouse-events',
)
const setVibrancy = defineInvokeEventa<void, [null | string]>('eventa:invoke:electron:window:set-vibrancy')
const setBackgroundMaterial = defineInvokeEventa<void, [string]>(
  'eventa:invoke:electron:window:set-background-material',
)
const resize = defineInvokeEventa<void, { deltaX: number; deltaY: number; direction: ResizeDirection }>(
  'eventa:invoke:electron:window:resize',
)
const close = defineInvokeEventa<void>('eventa:invoke:electron:window:close')

export type VibrancyType = string | undefined | null
export type BackgroundMaterialType = string
export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export type ElectronWindowLifecycleReason =
  | 'initial'
  | 'snapshot'
  | 'show'
  | 'hide'
  | 'minimize'
  | 'restore'
  | 'focus'
  | 'blur'

export interface ElectronWindowLifecycleState {
  focused: boolean
  minimized: boolean
  reason: ElectronWindowLifecycleReason
  updatedAt: number
  visible: boolean
}

export const window = {
  getBounds,
  getLifecycleState: electronGetWindowLifecycleState,
  setBounds,
  setIgnoreMouseEvents,
  setVibrancy,
  setBackgroundMaterial,
  resize,
  close,
}
