import type { WindowTargetSummary } from '..'

export interface WindowMeta extends WindowTargetSummary {
  layer?: number
  alpha?: number
}

export interface WindowTracker {
  listWindows: () => Promise<WindowMeta[]>
  getWindowMeta: (windowId: string) => Promise<WindowMeta | undefined>
  getWindowsAbove: (windowId: string) => Promise<WindowMeta[]>
}
