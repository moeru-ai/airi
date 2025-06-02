import { getCurrentWindow } from '@tauri-apps/api/window'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { WindowControlMode } from '../types/window-controls'
import { startClickThrough, stopClickThrough } from '../utils/windows'

export const useWindowControlStore = defineStore('windowControl', () => {
  const controlMode = ref<WindowControlMode>(WindowControlMode.NONE)
  const isControlActive = ref(false)
  const isIgnoringMouseEvent = ref(true)
  const size = useLocalStorage('window/control/size', { width: 300 * 1.5, height: 400 * 1.5 })
  const position = useLocalStorage('window/control/position', { x: 0, y: 0 })

  function setMode(mode: WindowControlMode) {
    controlMode.value = mode
  }

  function toggleControl() {
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
    size,
    position,
    setMode,
    toggleControl,
  }
})
