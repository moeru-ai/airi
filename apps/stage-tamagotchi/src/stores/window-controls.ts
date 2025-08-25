import type { AiriTamagotchiEvents } from '../composables/tauri'

import { getCurrentWindow } from '@tauri-apps/api/window'
import { defineStore } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'

import { useTauriEvent } from '../composables/tauri'
import { WindowControlMode } from '../types/window-controls'
import { startClickThrough, stopClickThrough } from '../utils/windows'

export const useWindowControlStore = defineStore('windowControl', () => {
  const controlMode = ref<WindowControlMode>(WindowControlMode.NONE)
  const isControlActive = ref(false)
  const isIgnoringMouseEvent = ref(true)

  function toggleMode(mode: WindowControlMode) {
    controlMode.value = mode
    isControlActive.value = !isControlActive.value
    if (!isControlActive.value) {
      controlMode.value = WindowControlMode.NONE
      if (isIgnoringMouseEvent.value)
        startClickThrough()

      return
    }

    stopClickThrough()

    const window = getCurrentWindow()
    window.setFocus()
  }

  return {
    controlMode,
    isControlActive,
    isIgnoringMouseEvent,
    toggleMode,
  }
})

export const useWindowMode = defineStore('window-mode', () => {
  const { listen } = useTauriEvent<AiriTamagotchiEvents>()
  const windowStore = useWindowControlStore()

  const unlistenFuncs = ref<(() => void)[]>([])

  async function setup() {
    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:move', () => {
      windowStore.toggleMode(WindowControlMode.MOVE)
    }))

    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:resize', () => {
      windowStore.toggleMode(WindowControlMode.RESIZE)
    }))

    unlistenFuncs.value.push(await listen('tauri-main:main:window-mode:fade-on-hover', async () => {
      windowStore.isIgnoringMouseEvent = !windowStore.isIgnoringMouseEvent
    }))
  }

  function cleanup() {
    unlistenFuncs.value.forEach(unlisten => unlisten())
    unlistenFuncs.value.length = 0
  }

  onMounted(setup)
  onUnmounted(cleanup)

  if (import.meta.hot) { // For better DX
    import.meta.hot.on('vite:beforeUpdate', () => cleanup())
    import.meta.hot.on('vite:afterUpdate', async () => await setup())
  }
})
