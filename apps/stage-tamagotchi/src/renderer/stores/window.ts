import { useWindowSize } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useElectronRelativeMouse } from '../composables/electron-vueuse'

export const useWindowStore = defineStore('tamagotchi-window', () => {
  const { width, height } = useWindowSize()
  const centerPos = computed(() => ({ x: width.value / 2, y: height.value / 2 }))

  // Use window-relative mouse coordinates for Live2D focus
  // Transforms screen coordinates to window-relative coordinates
  const { x: live2dLookAtX, y: live2dLookAtY } = useElectronRelativeMouse({ initialValue: centerPos.value })

  return {
    width,
    height,
    centerPos,
    live2dLookAtX,
    live2dLookAtY,
  }
})
