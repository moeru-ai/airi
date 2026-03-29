import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export interface DesktopWindowInfo {
  /** Native window handle / source ID from desktopCapturer */
  id: string
  /** Window title */
  name: string
  /** Base64 encoded thumbnail (small size for UI preview) */
  thumbnail?: string
}

export type DockPosition = 'left' | 'right' | 'top' | 'bottom'

export interface DockModeConfig {
  /** Target window source ID */
  targetWindowId: string
  /** Which edge of the target window to dock to */
  position: DockPosition
  /** Offset from the docking edge in pixels */
  offset: { x: number, y: number }
}

export interface DockModeStatus {
  active: boolean
  targetWindowId?: string
  targetWindowName?: string
  position?: DockPosition
}

export interface TargetWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

const listWindows = defineInvokeEventa<DesktopWindowInfo[]>('eventa:invoke:electron:dock-mode:list-windows')
const start = defineInvokeEventa<DockModeStatus, DockModeConfig>('eventa:invoke:electron:dock-mode:start')
const stop = defineInvokeEventa<DockModeStatus>('eventa:invoke:electron:dock-mode:stop')
const getStatus = defineInvokeEventa<DockModeStatus>('eventa:invoke:electron:dock-mode:get-status')

export const dockModeTargetBounds = defineEventa<TargetWindowBounds>('eventa:event:electron:dock-mode:target-bounds')
export const dockModeStatusChanged = defineEventa<DockModeStatus>('eventa:event:electron:dock-mode:status-changed')

export const dockMode = {
  listWindows,
  start,
  stop,
  getStatus,
}
