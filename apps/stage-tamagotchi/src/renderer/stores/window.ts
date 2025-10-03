import { useWindowSize } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// import { useTauriWindowClickThrough } from '../composables/tauri-window-pass-through-on-hover'
import { useWindowControlStore } from './window-controls'

export const useWindowStore = defineStore('tamagotchi-window', () => {
  const windowControlStore = useWindowControlStore()

  const { width, height } = useWindowSize()
  const centerPos = computed(() => ({ x: width.value / 2, y: height.value / 2 }))
  // const { live2dLookAtX, live2dLookAtY, isCursorInside } = useTauriWindowClickThrough(centerPos)
  const live2dLookAtX = ref(0)
  const live2dLookAtY = ref(0)
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
