import { defineInvokeEventa } from '@moeru/eventa'

export interface WindowInfo {
  title: string
  processName: string
}

export interface SystemLoadAverages {
  cpu: [number, number, number]
  gpuAvg: number
}

export interface ActiveWindowEntry {
  window: WindowInfo
  durationMs: number
  startTime: number
  endTime: number
}

export const sensorsGetIdleTime = defineInvokeEventa<number>('eventa:invoke:electron:sensors:get-idle-time')
export const sensorsGetActiveWindow = defineInvokeEventa<WindowInfo | null>('eventa:invoke:electron:sensors:get-active-window')
export const sensorsGetLocalTime = defineInvokeEventa<string>('eventa:invoke:electron:sensors:get-local-time')
export const sensorsGetSystemLoad = defineInvokeEventa<SystemLoadAverages>('eventa:invoke:electron:sensors:get-system-load')
export const sensorsGetActiveWindowHistory = defineInvokeEventa<ActiveWindowEntry[]>('eventa:invoke:electron:sensors:get-active-window-history')
