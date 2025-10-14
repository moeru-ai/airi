import { useWindowSize } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useWindowControlStore } from './window-controls'
import { useWindowMouse } from './window-mouse'

export const useWindowStore = defineStore('tamagotchi-window', () => {
  const windowControlStore = useWindowControlStore()

  const { width, height } = useWindowSize()
  const centerPos = computed(() => ({ x: width.value / 2, y: height.value / 2 }))
  const { x: live2dLookAtX, y: live2dLookAtY } = useWindowMouse(centerPos.value)
  const isCursorInside = ref(false)
  const shouldHideView = computed(() => isCursorInside.value && !windowControlStore.isControlActive && windowControlStore.isIgnoringMouseEvent)

  return {
    width,
    height,
    centerPos,
    live2dLookAtX,
    live2dLookAtY,
    isCursorInside,
    shouldHideView,
  }
})
