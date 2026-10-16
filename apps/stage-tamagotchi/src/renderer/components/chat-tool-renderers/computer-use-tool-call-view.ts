/** A point in the logical screen coordinates of AUV. */
export interface ComputerUsePoint { x: number, y: number }
export interface ComputerUseSize { width: number, height: number }
export interface ComputerUseRect { origin: ComputerUsePoint, size: ComputerUseSize }

/** How AUV delivered one input action, and what it disturbed on the way. */
export interface ComputerUseInputAction {
  attempts: Array<{ path: string, succeeded: boolean, message: string | null }>
  selected_path: string
  mouse_disturbance: string
  focus_disturbance: string
  clipboard_disturbance: string
  verified: boolean
}

export interface ComputerUseTextMatch { text: string, confidence: number, bounds: ComputerUseRect }

export interface ComputerUseWindow {
  id: string
  app_name: string
  app_bundle_id: string | null
  title: string
  process_id: number
  is_main: boolean
  is_visible: boolean
  frame: ComputerUseRect
}

export interface ComputerUseDisplay {
  id: string
  name: string
  is_builtin: boolean
  is_primary: boolean
  scale_factor: number
  frame: ComputerUseRect
}

export interface ComputerUseMediaState {
  present: boolean
  is_playing: boolean
  playback_rate: number
  title?: string | null
  artist?: string | null
  album?: string | null
  source_bundle_id?: string | null
  duration_seconds?: number | null
  elapsed_seconds?: number | null
  is_liked?: boolean | null
  supports_like?: boolean | null
}

/** One step of `input.keyboard`, as the call asked for it and as AUV delivered it. */
export interface ComputerUseKeyboardStep {
  spec?: { kind: 'press', keys: string[] } | { kind: 'type_text', text: string } | { kind: 'other', text: string }
  action: ComputerUseInputAction
}

/** What the card shows below its header, for each kind of AUV command. */
export type ComputerUseView
  = | {
    kind: 'capture'
    capture: { backend: string, bounds: ComputerUseRect, pixelSize: ComputerUseSize, scale: number, fallbackReason: string | null }
    display?: ComputerUseDisplay
    window?: ComputerUseWindow
    files: Array<{ path: string, extension: string, bytes: number }>
  }
  | { kind: 'displays', displays: ComputerUseDisplay[] }
  | { kind: 'windows', windows: ComputerUseWindow[] }
  | { kind: 'matches', query: string, matches: ComputerUseTextMatch[], window?: ComputerUseWindow }
  | {
    kind: 'click-text'
    query: string
    matches: ComputerUseTextMatch[]
    point: ComputerUsePoint
    selectedIndex?: number
    options?: { button: string, click: string, modifiers: string[], policy: string, windowStrategy: string }
    window?: ComputerUseWindow
    action: ComputerUseInputAction
  }
  | { kind: 'text', mode: 'type' | 'paste', text: string, action: ComputerUseInputAction }
  | { kind: 'keys', keys: string[], count?: string, intervalMs?: string, durationMs?: string, action: ComputerUseInputAction }
  | { kind: 'keyboard', steps: ComputerUseKeyboardStep[] }
  | { kind: 'focus', query: string, app: string, pid: number, role: string, title: string, value: string, path: string, action: ComputerUseInputAction }
  | { kind: 'move', point: ComputerUsePoint, action: ComputerUseInputAction }
  | {
    kind: 'click'
    requested: ComputerUsePoint
    onScreen: ComputerUsePoint
    relativeTo: string
    normalized: boolean
    button: string
    count?: string
    modifiers: string[]
    action: ComputerUseInputAction
  }
  | {
    kind: 'drag'
    requestedStart: ComputerUsePoint
    requestedEnd: ComputerUsePoint
    start: ComputerUsePoint
    end: ComputerUsePoint
    final: ComputerUsePoint
    relativeTo: string
    normalized: boolean
    button: string
    durationMs: number
    action: ComputerUseInputAction
  }
  | { kind: 'activate', requested: string, observed: string, verification: string }
  | { kind: 'permissions', permissions: Array<{ name: string, status: string }> }
  | { kind: 'now-playing', state: ComputerUseMediaState }
  | { kind: 'media', command: string, verified: boolean, before: ComputerUseMediaState, after: ComputerUseMediaState }
