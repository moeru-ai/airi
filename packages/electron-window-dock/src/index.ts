import type { Rectangle } from 'electron'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

/**
 * - `detached`: no session. Dock Mode never started, a caller stopped it, or the overlay window failed or was destroyed.
 * - `companion`: the target is hidden or minimized. When the target is lost, the session also ends in this state.
 * - `docking-attached-visible`: the overlay is on the target.
 * - `docking-attached-hidden`: the session continues, but the target is fullscreen or not frontmost.
 */
export type DockModeState
  = | 'detached'
    | 'companion'
    | 'docking-attached-visible'
    | 'docking-attached-hidden'

/**
 * A rect inside the target window. Each edge is a fraction of the target width or height,
 * from 0 (left or top) to 1 (right or bottom). `left` must be less than `right`, and `top` less than `bottom`.
 */
export interface DockViewport {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Dock Mode settings. The main process validates each update and rejects values outside the limits below.
 */
export interface DockConfig {
  /** The poll interval while the overlay is visible, from 16 to 60000 ms. */
  activeIntervalMs?: number
  /** The poll interval while the target is hidden, fullscreen, or not frontmost, from 100 to 60000 ms. */
  hiddenIntervalMs?: number
  /** The poll interval after the overlay shows or the target moves, from 16 to 60000 ms. */
  burstIntervalMs?: number
  /** The number of ticks at `burstIntervalMs`, an integer from 0 to 100. */
  burstTicks?: number
  /** If true, mouse events go through the overlay to the windows below it. */
  clickThrough?: boolean
  /** The space added on each side of the viewport rect, from 0 to 500 DIP. */
  padding?: number
  /**
   * If true, the overlay hides while a window is above the target. If false, the overlay stays on a covered target.
   * A hidden, minimized, or fullscreen target hides the overlay with either value.
   */
  hideWhenNotFrontmost?: boolean
  /**
   * If true, the character in the overlay hides while the cursor is on it or near it, and shows again when the
   * cursor moves away. The overlay renderer applies this option. It gets the value from `windowDock.configChanged`.
   */
  hideOnHover?: boolean
  /** Restricts the overlay to a rect inside the target window. */
  viewport?: DockViewport
}

export const defaultDockConfig: Required<DockConfig> = {
  activeIntervalMs: 80,
  hiddenIntervalMs: 1000,
  burstIntervalMs: 40,
  burstTicks: 3,
  clickThrough: true,
  padding: 0,
  hideWhenNotFrontmost: true,
  hideOnHover: true,
  viewport: {
    left: 0,
    right: 1,
    top: 0,
    bottom: 1,
  },
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
  /** The delay before the next tick. It is 0 when no session runs. */
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
export const windowDockGetConfig = defineInvokeEventa<Required<DockConfig>, void>('eventa:invoke:electron:window-dock:get-config')
export const windowDockSetConfig = defineInvokeEventa<DockDebugState, DockConfig>('eventa:invoke:electron:window-dock:set-config')
/**
 * The running config. The main process sends it to the overlay renderer when it creates the overlay window,
 * and after each config update while the window exists. Other renderers do not get this event.
 */
export const windowDockConfigChanged = defineEventa<Required<DockConfig>>('eventa:event:electron:window-dock:config-changed')

export const windowDock = {
  listTargets: windowDockListTargets,
  start: windowDockStart,
  stop: windowDockStop,
  getDebugState: windowDockGetDebugState,
  getConfig: windowDockGetConfig,
  setConfig: windowDockSetConfig,
  configChanged: windowDockConfigChanged,
}
