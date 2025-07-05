import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import type { EventCallback, EventName, UnlistenFn } from '@tauri-apps/api/event'
import type { Monitor } from '@tauri-apps/api/window'

import type { InvokeMethods, InvokeMethodShape } from '../tauri/invoke'

import { withRetry } from '@moeru/std'
import { computedAsync, until } from '@vueuse/core'

import { useAppRuntime } from './runtime'

export async function untilNoError<T>(fn: () => Promise<T>, onError?: (err?: unknown | null) => void): Promise<T> {
  const fnRetry = withRetry(fn, { retryDelay: 5000, retry: 5, onError })
  return await fnRetry()
}

export async function untilImported<T>(fn: () => Promise<T>, onError?: (err?: unknown | null) => void): Promise<T> {
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

export function useTauriCore<IM extends Record<keyof IM, InvokeMethodShape> = InvokeMethods>() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriCoreApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/api/core'), console.warn)
    }
  })

  const tauriCoreApiInvoke = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('../tauri/invoke'), console.warn)
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

    await until(tauriCoreApiInvoke).toBeTruthy()
    const imported = await tauriCoreApiInvoke.value
    if (!imported) {
      throw new Error('Tauri core API not available')
    }

    return await imported.invoke<C, IM>(command, args as InvokeArgs | undefined, options as InvokeOptions | undefined)
  }

  return {
    invoke,
    core: tauriCoreApi,
  }
}

export function useTauriDpi() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriDpiApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/api/window'), console.warn)
    }
  })

  async function createLogicalPosition(x: number, y: number) {
    const imported = await tauriDpiApi.value
    if (!imported) {
      throw new Error('Tauri DPI API not available')
    }

    return new imported.LogicalPosition(x, y)
  }

  return {
    createLogicalPosition,
  }
}

export function useTauriWindow() {
  const { platform, isInitialized } = useAppRuntime()
  const { createLogicalPosition } = useTauriDpi()

  const tauriWindowApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/api/window'), console.warn)
    }
  })

  async function _ensureImported() {
    await until(isInitialized).toBeTruthy()
    if (platform.value === 'web') {
      throw new Error('Tauri Window API is not available in web platform')
    }

    await until(tauriWindowApi).toBeTruthy()
    const imported = await tauriWindowApi.value
    if (!imported) {
      throw new Error('Tauri Window API not available')
    }

    return imported
  }

  async function getCurrentMonitor() {
    try {
      return await _ensureImported().then(imported => imported.currentMonitor())
    }
    catch (error) {
      console.error('Failed to get current monitor:', error)
      return undefined
    }
  }

  async function getAvailableMonitors() {
    try {
      return await _ensureImported().then(imported => imported.availableMonitors())
    }
    catch (error) {
      console.error('Failed to get available monitors:', error)
      return []
    }
  }

  async function getPrimaryMonitor() {
    try {
      return await _ensureImported().then(imported => imported.primaryMonitor())
    }
    catch (error) {
      console.error('Failed to get primary monitor:', error)
      return undefined
    }
  }

  async function setPosition(x: number, y: number) {
    try {
      const imported = await _ensureImported()
      const window = imported.getCurrentWindow()
      return await window.setPosition(await createLogicalPosition(x, y))
    }
    catch (error) {
      console.error('Failed to set window position:', error)
    }
  }

  return {
    getAvailableMonitors,
    getCurrentMonitor,
    getPrimaryMonitor,
    setPosition,
  }
}
