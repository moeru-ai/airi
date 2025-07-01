import { computedAsync, until } from '@vueuse/core'

import { useAppRuntime } from './runtime'
import { untilImported } from './tauri'

export enum StateFlags {
  SIZE = 1,
  POSITION = 2,
  MAXIMIZED = 4,
  VISIBLE = 8,
  DECORATIONS = 16,
  FULLSCREEN = 32,
  ALL = 63,
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

  async function saveWindowState(stateFlag?: StateFlags) {
    await ensureImported()
    if (stateFlag != null) {
      return tauriWindowStateApi.value?.saveWindowState(stateFlag)
    }
    else {
      return tauriWindowStateApi.value?.saveWindowState(tauriWindowStateApi.value.StateFlags.ALL)
    }
  }

  async function restoreState(stateFlag?: StateFlags, windowLabel = 'main') {
    await ensureImported()
    if (stateFlag != null) {
      return tauriWindowStateApi.value?.restoreState(windowLabel, stateFlag)
    }
    else {
      return tauriWindowStateApi.value?.restoreState(windowLabel, tauriWindowStateApi.value.StateFlags.ALL)
    }
  }

  async function restoreStateCurrent(stateFlag?: StateFlags) {
    await ensureImported()
    if (stateFlag != null) {
      return tauriWindowStateApi.value?.restoreStateCurrent(stateFlag)
    }
    else {
      return tauriWindowStateApi.value?.restoreStateCurrent(tauriWindowStateApi.value.StateFlags.ALL)
    }
  }

  return {
    saveWindowState,
    restoreState,
    restoreStateCurrent,
  }
}
