import { bounds } from '@proj-airi/tauri-eventa'
import { ref } from 'vue'

import { getElectronEventaContext } from './use-electron-eventa-context'

const windowBoundsX = ref(0)
const windowBoundsY = ref(0)
const windowBoundsWidth = ref(0)
const windowBoundsHeight = ref(0)

let lastContext: ReturnType<typeof getElectronEventaContext> | null = null

function initializeWindowBoundsTracking() {
  const context = getElectronEventaContext()

  if (lastContext === context) return
  lastContext = context

  context.on(bounds, (event) => {
    if (!event?.body) return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
  })
}

export function useElectronWindowBounds() {
  initializeWindowBoundsTracking()

  return {
    x: windowBoundsX,
    y: windowBoundsY,
    width: windowBoundsWidth,
    height: windowBoundsHeight,
  }
}
