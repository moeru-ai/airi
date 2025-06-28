import type { EventCallback, EventName, UnlistenFn } from '@tauri-apps/api/event'

import { withRetry } from '@moeru/std'
import { computedAsync, until } from '@vueuse/core'

async function untilNoError<T>(fn: () => Promise<T>, onError?: (err?: unknown | null) => void): Promise<T> {
  const fnRetry = withRetry(fn, { retryDelay: 5000, retry: Number.MAX_SAFE_INTEGER - 2, onError })
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

export type Event<E extends { [key: string]: any }> = {
  [K in keyof E]: E[K];
}[keyof E]

export function useTauriEvent<ES = Events>() {
  const tauriEventApi = computedAsync(() => untilImported(() => import('@tauri-apps/api/event'), console.warn))

  async function _listen<E extends keyof ES>(event: E, callback: EventCallback<ES[E]>) {
    await until(tauriEventApi).toBeTruthy()
    const imported = await tauriEventApi.value
    if (!imported) {
      throw new Error('Tauri event API not available')
    }

    return untilNoError(() => imported.listen(event as EventName, callback), console.warn)
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
