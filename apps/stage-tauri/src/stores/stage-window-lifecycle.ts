import type { ElectronWindowLifecycleState } from '@proj-airi/tauri-eventa'

import { electronGetWindowLifecycleState, electronWindowLifecycleChanged } from '@proj-airi/tauri-eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/tauri-vueuse'
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
  return state.minimized
}

export const useStageWindowLifecycleStore = defineStore('stageWindowLifecycle', () => {
  const windowLifecycle = ref<ElectronWindowLifecycleState>(createDefaultWindowLifecycleState())
  const stagePaused = computed(() => shouldPauseStageFromLifecycle(windowLifecycle.value))

  // Track the context instance we last registered a listener against so that
  // a reset (see resetElectronEventaContextForTesting) is detected and the new
  // context gets a fresh listener + initial-state fetch. A bare boolean flag
  // would stay `true` after the reset and silently drop all future events.
  let lastContext: ReturnType<typeof getElectronEventaContext> | null = null

  function updateWindowLifecycle(state: ElectronWindowLifecycleState) {
    windowLifecycle.value = { ...state }
    console.info('[StageWindowLifecycle] state changed', windowLifecycle.value)
  }

  async function initializeWindowLifecycleBridge() {
    const context = getElectronEventaContext()
    if (lastContext === context) return

    lastContext = context

    context.on(electronWindowLifecycleChanged, (event) => {
      if (!event?.body) return
      updateWindowLifecycle(event.body)
    })

    try {
      const getWindowLifecycleState = useElectronEventaInvoke(electronGetWindowLifecycleState, context)
      updateWindowLifecycle(await getWindowLifecycleState())
    } catch (error) {
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
