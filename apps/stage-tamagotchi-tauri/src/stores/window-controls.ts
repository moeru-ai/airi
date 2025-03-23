import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { WindowControlMode } from '../types/window-controls'

export const useWindowControlStore = defineStore('windowControl', () => {
  const controlMode = ref<WindowControlMode>(WindowControlMode.DEFAULT)
  const isControlActive = ref(false)
  const size = useLocalStorage('window/control/size', { width: 300 * 1.5, height: 400 * 1.5 })
  const position = useLocalStorage('window/control/position', { x: 0, y: 0 })

  function setMode(mode: WindowControlMode) {
    controlMode.value = mode

    if (mode === WindowControlMode.RESIZE) {
      // window.electron.ipcRenderer.send('start-resize-window')
      // return
    }

    // window.electron.ipcRenderer.invoke('stop-move-window').then((p: [number, number]) => {
    //   position.value = { x: p[0], y: p[1] }
    // })
    // window.electron.ipcRenderer.send('stop-resize-window')
    // TODO: save position and size
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
    size,
    position,
    setMode,
    toggleControl,
  }
})
