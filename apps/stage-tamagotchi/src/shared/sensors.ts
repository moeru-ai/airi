import { defineInvokeEventa } from '@moeru/eventa'

export interface WindowInfo {
  title: string
  processName: string
}

export const sensorsGetIdleTime = defineInvokeEventa<number>('eventa:invoke:electron:sensors:get-idle-time')
export const sensorsGetActiveWindow = defineInvokeEventa<WindowInfo | null>('eventa:invoke:electron:sensors:get-active-window')
