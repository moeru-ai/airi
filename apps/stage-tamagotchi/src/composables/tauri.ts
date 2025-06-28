import type { InvokeArgs, InvokeOptions } from '@tauri-apps/api/core'
import type { EventCallback, EventName, UnlistenFn } from '@tauri-apps/api/event'

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
  'tauri-app:window-click-through:position-cursor-and-window-frame': [Point, WindowFrame]
  'tauri-app:model-load-progress': [string, number]
  'mcp_plugin_destroyed': undefined
}

export function useTauriEvent<ES = Events>() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriEventApi = computedAsync(() => {
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

    return untilNoError(() => imported.listen(event as EventName, callback), console.warn)
  }

  async function listen<E extends keyof ES>(event: E, callback: EventCallback<ES[E]>) {
    if (platform.value === 'web') {
      console.warn(`Attempted to listen to Tauri event "${String(event)}" in web platform, however, currently we are not in a Tauri environment.`)
      return () => {}
    }

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
  open_settings_window: { args: undefined, options: undefined, returns: void }
  start_monitor: { args: undefined, options: undefined, returns: void }
  stop_monitor: { args: undefined, options: undefined, returns: void }
  open_chat_window: { args: undefined, options: undefined, returns: void }
  load_models: { args: undefined, options: undefined, returns: void }
  stop_click_through: { args: undefined, options: undefined, returns: void }
  start_click_through: { args: undefined, options: undefined, returns: void }

  // WindowLink.vue
  open_route_in_window: {
    args: { route: string, windowLabel?: string } | undefined
    options: undefined
    returns: void
  }
}

interface InvokeMethodShape {
  args: InvokeArgs | undefined
  options: InvokeOptions | undefined
  returns: any
}

export function useTauriCore<IM extends Record<keyof IM, InvokeMethodShape> = InvokeMethods>() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriCoreApi = computedAsync(() => {
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

    return await untilNoError(() => imported.invoke(command as string, args as InvokeArgs | undefined, options as InvokeOptions | undefined), console.warn)
  }

  return {
    invoke,
  }
}
