import { defineInvoke } from '@moeru/eventa'
import { ref } from 'vue'

import { bounds, startLoopGetBounds } from '../../../../shared/electron/window'
import { useElectronEventaContext } from '../use-electron-eventa-context'

export function useElectronWindowBounds() {
  const context = useElectronEventaContext()
  const windowBoundsX = ref(0)
  const windowBoundsY = ref(0)
  const windowBoundsWidth = ref(0)
  const windowBoundsHeight = ref(0)

  context.value.on(bounds, (event) => {
    if (!event || !event.body)
      return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
  })

  defineInvoke(context.value!, startLoopGetBounds)()
  return {
    x: windowBoundsX,
    y: windowBoundsY,
    width: windowBoundsWidth,
    height: windowBoundsHeight,
  }
}
