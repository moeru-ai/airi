import type { MaybeRefOrGetter } from 'vue'

import { isStageWeb } from '@proj-airi/stage-shared'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, toValue } from 'vue'

const breakpoints = useBreakpoints(breakpointsTailwind)
const startingOffsetY = computed(() => {
  if (isStageWeb()) // showing upper half of the body in landscape, 3/4 in portrait, in web targets
    return breakpoints.smallerOrEqual('md').value ? 0.75 : 1
  return 1 // upper half
})

/**
 *  Normalizes the model so that user `scale == 1` means twice the viewport height,
 *  and the model centered horizontally when `position.x == 0`,
 *  showing upper half of the body when `position.y == 0`
 */
export function useFitModel(
  canvasDim: MaybeRefOrGetter<{ width: number, height: number }>,
  modelDim: MaybeRefOrGetter<{ width: number, height: number }>,
) {
  const normalizedParam = computed(() => {
    const canvas = toValue(canvasDim)
    const model = toValue(modelDim)

    const heightScale = (canvas.height / model.height * 2)
    const widthScale = (canvas.width / model.width * 2)
    let minScale = Math.min(heightScale, widthScale)

    if (Number.isNaN(minScale) || minScale <= 0) {
      minScale = 1e-6
    }
    return {
      scale: minScale,
      x: canvas.width / 2,
      y: canvas.height * startingOffsetY.value,
    }
  })

  return normalizedParam
}
