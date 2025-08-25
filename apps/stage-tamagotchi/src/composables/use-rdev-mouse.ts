import type { AiriTamagotchiEvents } from './tauri'

import { createSharedComposable } from '@vueuse/core'
import { ref } from 'vue'

import { useTauriEvent } from './tauri'

export const useRdevMouse = createSharedComposable(() => {
  const mouseX = ref(0)
  const mouseY = ref(0)

  const { listen } = useTauriEvent<AiriTamagotchiEvents>()

  async function setup() {
    await listen('tauri-plugins:tauri-plugin-rdev:mousemove', (event) => {
      if (event.payload.event_type.MouseMove) {
        const { x, y } = event.payload.event_type.MouseMove
        mouseX.value = x
        mouseY.value = y
      }
    })
  }

  setup()

  return {
    mouseX,
    mouseY,
  }
})
