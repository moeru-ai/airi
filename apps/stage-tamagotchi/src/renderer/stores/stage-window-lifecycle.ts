import type { ElectronWindowLifecycleState } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { electronGetWindowLifecycleState, electronWindowLifecycleChanged } from '../../shared/eventa'

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
  return !state.visible || state.minimized
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

    const context = getElectronEventaContext()
    context.on(electronWindowLifecycleChanged, (event) => {
      if (!event?.body)
        return
      updateWindowLifecycle(event.body)
    })

    try {
      const getWindowLifecycleState = defineInvoke(context, electronGetWindowLifecycleState)
      updateWindowLifecycle(await getWindowLifecycleState())
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
