import type { ElectronWindowLifecycleState } from '../../shared/eventa'

import { useHostWindowLifecycle } from '@proj-airi/stage-host-context'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export function createDefaultWindowLifecycleState(): ElectronWindowLifecycleState {
  return {
    focused: true,
    minimized: false,
    reason: 'initial',
    updatedAt: 0,
    visible: true,
  }
}

export function shouldPauseStageFromLifecycle(state: ElectronWindowLifecycleState) {
  // When the app window is moved to another virtual desktop on Windows, it may be treated as not visible
  // by the platform even though we still need the stage to keep animating (for window capture usage).
  // Only pause when minimized, and keep running for desktop-switch visibility changes.
  return state.minimized
}

export const useStageWindowLifecycleStore = defineStore('stageWindowLifecycle', () => {
  const windowLifecycle = ref<ElectronWindowLifecycleState>(createDefaultWindowLifecycleState())
  const stagePaused = computed(() => shouldPauseStageFromLifecycle(windowLifecycle.value))

  let initialized = false

  function updateWindowLifecycle(state: ElectronWindowLifecycleState) {
    windowLifecycle.value = { ...state }
  }

  async function initializeWindowLifecycleBridge() {
    if (initialized)
      return

    initialized = true

    const lifecycle = useHostWindowLifecycle()
    lifecycle.onChanged(updateWindowLifecycle)

    try {
      updateWindowLifecycle(await lifecycle.getState())
    }
    catch (error) {
      console.warn('[StageWindowLifecycle] Failed to fetch initial window lifecycle state.', error)
    }
  }

  return {
    initializeWindowLifecycleBridge,
    stagePaused,
    updateWindowLifecycle,
    windowLifecycle,
  }
})
