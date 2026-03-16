import type { Bounds } from '../types'

export type DesktopMode
  = | 'idle'
    | 'observing'
    | 'suggesting'
    | 'acting'
    | 'interrupted'
    | 'recovering'

export type ControlLeaseKind = 'observe' | 'suggest' | 'act'

export interface ControlLease {
  holder: 'user' | 'airi'
  kind: ControlLeaseKind
  startedAt: number
  expiresAt: number
  interruptOnUserInput: boolean
}

export interface GhostPointerState {
  visible: boolean
  x: number
  y: number
  targetX: number
  targetY: number
  label?: string
  style: 'follow' | 'preview' | 'acting' | 'error'
}

export interface WindowNode {
  id: string
  windowNumber?: number
  appName: string
  title: string
  bounds: Bounds
  ownerPid?: number
  focused: boolean
  zIndex: number
  screenId: string
  axRole?: string
}

export interface DesktopScene {
  capturedAt: string
  screens: Array<{ id: string, bounds: Bounds }>
  windows: WindowNode[]
  pointer: { x: number, y: number }
  focusedApp?: string
  focusedWindowId?: string
}

export type LayoutPresetId = 'coding-dual-pane' | 'review-mode' | 'agent-watch'

export interface LayoutTarget {
  windowId: string
  bounds: Bounds
  reason: string
}

export interface LayoutPreview {
  layoutId: LayoutPresetId
  targets: LayoutTarget[]
  focusOrder: string[]
  unresolvedWindowIds: string[]
  notes: string[]
}

export type DesktopActionPlanStep
  = | {
    kind: 'focus_window'
    windowId: string
  }
  | {
    kind: 'move_resize_window'
    windowId: string
    bounds: Bounds
  }
  | {
    kind: 'click'
    x: number
    y: number
    button?: 'left' | 'right' | 'middle'
    clickCount?: number
  }
  | {
    kind: 'wait'
    durationMs: number
  }

export interface DesktopActionPlan {
  id: string
  createdAt: string
  steps: DesktopActionPlanStep[]
}

export interface DesktopActionPlanResult {
  status: 'completed' | 'interrupted' | 'failed' | 'unsupported'
  executedSteps: number
  errors: string[]
  details: Record<string, unknown>[]
}
