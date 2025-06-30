import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import type { EventCallback, EventName, UnlistenFn } from '@tauri-apps/api/event'
import type { Position } from '@tauri-apps/plugin-positioner'
import type { StateFlags } from '@tauri-apps/plugin-window-state'

import { withRetry } from '@moeru/std'
import { computedAsync, until } from '@vueuse/core'

import { useAppRuntime } from './runtime'

async function untilNoError<T>(fn: () => Promise<T>, onError?: (err?: unknown | null) => void): Promise<T> {
  const fnRetry = withRetry(fn, { retryDelay: 5000, retry: 5, onError })
  return await fnRetry()
}

async function untilImported<T>(fn: () => Promise<T>, onError?: (err?: unknown | null) => void): Promise<T> {
  return await untilNoError(fn, onError)
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface WindowFrame {
  origin: Point
  size: Size
}

interface Events {
  'tauri://resize': unknown
  'tauri://move': unknown
  'tauri://close-requested': unknown
  'tauri://destroyed': unknown
  'tauri://focus': unknown
  'tauri://blur': unknown
  'tauri://scale-change': unknown
  'tauri://theme-changed': unknown
  'tauri://window-created': unknown
  'tauri://webview-created': unknown
  'tauri://drag-enter': unknown
  'tauri://drag-over': unknown
  'tauri://drag-drop': unknown
  'tauri://drag-leave': unknown
}

export interface AiriTamagotchiEvents extends Events {
  'tauri-app:proj-airi:window-pass-through-on-hover:cursor-position': Point
  'tauri-app:proj-airi:window-pass-through-on-hover:window-frame': WindowFrame
  'tauri-app:proj-airi:window-pass-through-on-hover:pass-through-enabled': boolean
  'tauri-app:model-load-progress': [string, number]
  'mcp_plugin_destroyed': undefined
}

export interface Monitor {
  name: string
  size: { width: number, height: number }
  position: { x: number, y: number }
  workArea: {
    position: { x: number, y: number }
    size: { width: number, height: number }
  }
  scale_factor: number
}

export interface DisplayInfo {
  monitors: Monitor[]
  primaryMonitor: Monitor
}

export enum PlacementStrategy {
  Center = 'Center',
  TopLeft = 'TopLeft',
  TopRight = 'TopRight',
  BottomLeft = 'BottomLeft',
  BottomRight = 'BottomRight',
  NearCursor = 'NearCursor',
  RestorePrevious = 'RestorePrevious',
  AvoidOverlap = 'AvoidOverlap',
}

export interface WindowPlacementRequest {
  window_size: Size
  preferred_position?: Point
  placement_strategy: PlacementStrategy
}

export interface WindowPlacementResult {
  position: Point
  target_monitor_id: number
  is_constrained: boolean
}

export function useTauriEvent<ES = Events>() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriEventApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/api/event'), console.warn)
    }
  })

  async function _listen<E extends keyof ES>(event: E, callback: EventCallback<ES[E]>) {
    await until(isInitialized).toBeTruthy()

    if (platform.value === 'web') {
      return () => {}
    }

    await until(tauriEventApi).toBeTruthy()
    const imported = await tauriEventApi.value
    if (!imported) {
      throw new Error('Tauri event API not available')
    }

    return await imported.listen(event as EventName, callback)
  }

  async function listen<E extends keyof ES>(event: E, callback: EventCallback<ES[E]>) {
    let cleanupListener: UnlistenFn | undefined

    _listen(event, callback).then((listener) => {
      cleanupListener = listener
    })

    return () => {
      cleanupListener?.()
    }
  }

  return {
    listen,
  }
}

export interface InvokeMethods {
  // Model related
  'load_models': { args: undefined, options: undefined, returns: void }

  // app windows
  'open_settings_window': { args: undefined, options: undefined, returns: void }
  'open_chat_window': { args: undefined, options: undefined, returns: void }

  // Plugin - WindowRouterLink
  'open_route_in_window': {
    args: { route: string, windowLabel?: string } | undefined
    options: undefined
    returns: void
  }

  // Plugin - Window Pass through on hover
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|start_monitor': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|stop_monitor': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|start_pass_through': { args: undefined, options: undefined, returns: void }
  'plugin:proj-airi-tauri-plugin-window-pass-through-on-hover|stop_pass_through': { args: undefined, options: undefined, returns: void }

  // Plugin - Window
  'plugin:proj-airi-tauri-plugin-window|get_display_info': {
    args: undefined
    options: undefined
    returns: [Monitor[], Monitor]
  }
  'plugin:proj-airi-tauri-plugin-window|get_current_window_info': {
    args: undefined
    options: undefined
    returns: [[number, number], [number, number]]
  }
  'plugin:proj-airi-tauri-plugin-window|set_position': {
    args: { x: number, y: number }
    options: undefined
    returns: void
  }

  // // Plugin - Window Persistence
  // 'plugin:proj-airi-tauri-plugin-window-persistence|save': {
  //   args: undefined
  //   options: undefined
  //   returns: void
  // }
  // 'plugin:proj-airi-tauri-plugin-window-persistence|restore': {
  //   args: undefined
  //   options: undefined
  //   returns: void
  // }
}

interface InvokeMethodShape {
  args: InvokeArgs | undefined
  options: InvokeOptions | undefined
  returns: any
}

export function useTauriCore<IM extends Record<keyof IM, InvokeMethodShape> = InvokeMethods>() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriCoreApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/api/core'), console.warn)
    }
  })

  async function invoke<C extends keyof IM>(
    command: C,
    args?: IM[C]['args'],
    options?: IM[C]['options'],
  ): Promise<IM[C]['returns'] | undefined> {
    await until(isInitialized).toBeTruthy()

    if (platform.value === 'web') {
      console.warn(`Attempted to invoke Tauri command "${String(command)}" in web platform`)
      return
    }

    await until(tauriCoreApi).toBeTruthy()
    const imported = await tauriCoreApi.value
    if (!imported) {
      throw new Error('Tauri core API not available')
    }

    return await imported.invoke(command as string, args as InvokeArgs | undefined, options as InvokeOptions | undefined)
  }

  return {
    invoke,
  }
}

export function useTauriPositioner() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriPositionerApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/plugin-positioner'), console.warn)
    }
  })

  async function ensureImported() {
    await until(isInitialized).toBeTruthy()

    if (platform.value === 'web') {
      console.warn('Attempted to use Tauri positioner in web platform')
      return
    }

    await until(tauriPositionerApi).toBeTruthy()
    const imported = await tauriPositionerApi.value
    if (!imported) {
      throw new Error('Tauri positioner API not available')
    }
  }

  async function moveWindow(to: Position) {
    await ensureImported()
    return tauriPositionerApi.value?.moveWindow(to)
  }

  return {
    moveWindow,
  }
}

export function useTauriWindowState() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriWindowStateApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/plugin-window-state'), console.warn)
    }
  })

  async function ensureImported() {
    await until(isInitialized).toBeTruthy()

    if (platform.value === 'web') {
      console.warn('Attempted to save window state in web platform')
      return
    }

    await until(tauriWindowStateApi).toBeTruthy()
    const imported = await tauriWindowStateApi.value
    if (!imported) {
      throw new Error('Tauri window state API not available')
    }
  }

  async function saveWindowState(stateFlag: StateFlags) {
    await ensureImported()
    return tauriWindowStateApi.value?.saveWindowState(stateFlag)
  }

  async function restoreState(stateFlag: StateFlags, windowLabel = 'main') {
    await ensureImported()
    return tauriWindowStateApi.value?.restoreState(windowLabel, stateFlag)
  }

  async function restoreStateCurrent(stateFlag: StateFlags) {
    await ensureImported()
    return tauriWindowStateApi.value?.restoreStateCurrent(stateFlag)
  }

  return {
    saveWindowState,
    restoreState,
    restoreStateCurrent,
  }
}
