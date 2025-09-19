import type { AiriTamagotchiEvents } from './tauri'

import { createSharedComposable } from '@vueuse/core'
import { ref, watch } from 'vue'

import { useTauriDpi, useTauriEvent } from './tauri'

export const useRdevMouse = createSharedComposable(() => {
  const mouseX = ref(0)
  const mouseY = ref(0)
  const logicalMouseX = ref(0)
  const logicalMouseY = ref(0)
  const scaleFactor = ref(1)

  const { listen } = useTauriEvent<AiriTamagotchiEvents>()
  const { getScaleFactor } = useTauriDpi()

  // Update scale factor when DPI changes
  async function updateScaleFactor() {
    try {
      const newScaleFactor = await getScaleFactor()
      console.warn(`[DPI Debug] Scale factor detected: ${newScaleFactor}`)
      scaleFactor.value = newScaleFactor
    }
    catch (error) {
      console.warn('Failed to get scale factor, using default 1.0:', error)
      scaleFactor.value = 1
    }
  }

  // Convert physical coordinates to logical coordinates
  watch([mouseX, mouseY, scaleFactor], ([x, y, scale]) => {
    logicalMouseX.value = x / scale
    logicalMouseY.value = y / scale

    // Debug logging every 100th mouse move to avoid spam
    if (Math.floor(x) % 100 === 0) {
      console.warn(`[DPI Debug] Physical: (${x}, ${y}) → Logical: (${logicalMouseX.value}, ${logicalMouseY.value}) | Scale: ${scale}`)
    }
  })

  async function setup() {
    await updateScaleFactor()

    await listen('tauri-plugins:tauri-plugin-rdev:mousemove', (event) => {
      if (event.payload.event_type.MouseMove) {
        const { x, y } = event.payload.event_type.MouseMove
        mouseX.value = x
        mouseY.value = y
      }
    })

    // Listen for scale changes (when window moves between monitors with different DPI)
    await listen('tauri://scale-change', () => {
      updateScaleFactor()
    })
  }

  setup()

  return {
    mouseX,
    mouseY,
    logicalMouseX,
    logicalMouseY,
    scaleFactor,
  }
})
