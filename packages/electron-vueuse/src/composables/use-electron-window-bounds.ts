import { defineInvoke } from '@moeru/eventa'
import { bounds, startLoopGetBounds } from '@proj-airi/electron-eventa'
import { ref } from 'vue'

import { getElectronEventaContext } from './use-electron-eventa-context'

const windowBoundsX = ref(0)
const windowBoundsY = ref(0)
const windowBoundsWidth = ref(0)
const windowBoundsHeight = ref(0)

let initialized = false

function initializeWindowBoundsTracking() {
  if (initialized) {
    return
  }

  initialized = true
  const context = getElectronEventaContext()

  context.on(bounds, (event) => {
    if (!event || !event.body)
      return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
  })

  void defineInvoke(context, startLoopGetBounds)()
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
