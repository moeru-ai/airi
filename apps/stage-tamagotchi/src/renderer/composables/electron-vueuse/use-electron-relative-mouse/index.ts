import type { UseMouseOptions } from '@vueuse/core'

import { computed } from 'vue'

import { useElectronMouse } from '../use-electron-mouse'
import { useElectronWindowBounds } from '../use-electron-window-bounds'

export function useElectronRelativeMouse(options?: UseMouseOptions) {
  const mouse = useElectronMouse(options)
  const { x: windowX, y: windowY } = useElectronWindowBounds()

  // Transform screen coordinates to window-relative coordinates
  const x = computed(() => mouse.x.value - windowX.value)
  const y = computed(() => mouse.y.value - windowY.value)

  return {
    ...mouse,
    x,
    y,
  }
}
