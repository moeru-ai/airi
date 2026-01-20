import type { Rectangle } from 'electron'

import { defineInvokeEventa } from '@moeru/eventa'

export type DockModeState
  = | 'detached'
    | 'companion'
    | 'docking-attached-visible'
    | 'docking-attached-hidden'

export interface DockConfig {
  activeIntervalMs?: number
  idleIntervalMs?: number
  hiddenIntervalMs?: number
  burstIntervalMs?: number
  burstTicks?: number
  clickThrough?: boolean
  padding?: number
  hideWhenInactive?: boolean
}

export interface WindowTargetSummary {
  id: string
  title?: string
  appName?: string
  ownerPid?: number
  layer?: number
  isOnScreen: boolean
  isMinimized?: boolean
  isFullscreen?: boolean
  bounds: Rectangle
  displayBounds?: Rectangle
}

export interface StartDockRequest {
  targetId: string
}

export interface DockDebugState {
  state: DockModeState
  targetId?: string
  pollIntervalMs: number
  lastReason?: string
  lastMeta?: WindowTargetSummary
  windowsAbove?: number
  lastUpdatedAt: number
}

export const windowDockListTargets = defineInvokeEventa<WindowTargetSummary[], void>('eventa:invoke:electron:window-dock:list-targets')
export const windowDockStart = defineInvokeEventa<DockDebugState, StartDockRequest>('eventa:invoke:electron:window-dock:start')
export const windowDockStop = defineInvokeEventa<DockDebugState, void>('eventa:invoke:electron:window-dock:stop')
export const windowDockGetDebugState = defineInvokeEventa<DockDebugState, void>('eventa:invoke:electron:window-dock:get-debug-state')
export const windowDockSetConfig = defineInvokeEventa<DockDebugState, DockConfig>('eventa:invoke:electron:window-dock:set-config')

export const windowDock = {
  listTargets: windowDockListTargets,
  start: windowDockStart,
  stop: windowDockStop,
  getDebugState: windowDockGetDebugState,
  setConfig: windowDockSetConfig,
}
