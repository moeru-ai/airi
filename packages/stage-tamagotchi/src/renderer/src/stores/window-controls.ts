import { defineStore } from 'pinia'
import { ref } from 'vue'

import { WindowControlMode } from '../types/window-controls'

export const useWindowControlStore = defineStore('windowControl', () => {
  const controlMode = ref<WindowControlMode>(WindowControlMode.DEFAULT)
  const isControlActive = ref(false)

  function setMode(mode: WindowControlMode) {
    controlMode.value = mode
  }

  function toggleControl() {
    isControlActive.value = !isControlActive.value
    if (!isControlActive.value) {
      controlMode.value = WindowControlMode.DEFAULT
    }
  }

  return {
    controlMode,
    isControlActive,
    setMode,
    toggleControl,
  }
})
