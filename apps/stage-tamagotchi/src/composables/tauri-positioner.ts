import type { Position } from '@tauri-apps/plugin-positioner'

import { computedAsync, until } from '@vueuse/core'

import { useAppRuntime } from './runtime'
import { untilImported } from './tauri'

export function useTauriPositioner() {
  const { platform, isInitialized } = useAppRuntime()

  const tauriPositionerApi = computedAsync(async () => {
    await until(isInitialized).toBeTruthy()

    if (platform.value !== 'web') {
      return untilImported(() => import('@tauri-apps/plugin-positioner'), () => {})
    }
  })

  async function ensureImported() {
    await until(isInitialized).toBeTruthy()

    if (platform.value === 'web') {
      // Tauri positioner web platform warning removed
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
