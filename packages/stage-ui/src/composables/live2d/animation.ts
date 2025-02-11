import type { InternalModel } from 'pixi-live2d-display/cubism4'

import { lerp, randFloat } from 'three/src/math/MathUtils.js'

import { randomSaccadeInterval } from '../../utils'

/**
 * This is to simulate idle eye saccades and focus (head) movements in a *pretty* naive way.
 * Not using any reactivity here as it's not yet needed.
 * Keeping it here as a composable for future extension.
 */
export function useLive2DIdleEyeFocus() {
  let nextSaccadeAfter = -1
  let focusTarget: [number, number] | undefined
  let lastSaccadeAt = -1

  // Function to handle idle eye saccades and focus (head) movements
  function update(model: InternalModel, now: number) {
    if (now >= nextSaccadeAfter || now < lastSaccadeAt) {
      focusTarget = [randFloat(-1, 1), randFloat(-1, 0.7)]
      lastSaccadeAt = now
      nextSaccadeAfter = now + (randomSaccadeInterval() / 1000)
      model.focusController.focus(focusTarget![0] * 0.5, focusTarget![1] * 0.5, false)
    }

    model.focusController.update(now - lastSaccadeAt)
    const coreModel = model.coreModel as any
    // TODO: After emotion mapper, stage editor, eye related parameters should be take cared to be dynamical instead of hardcoding
    coreModel.setParameterValueById('ParamEyeBallX', lerp(coreModel.getParameterValueById('ParamEyeBallX'), focusTarget![0], 0.3))
    coreModel.setParameterValueById('ParamEyeBallY', lerp(coreModel.getParameterValueById('ParamEyeBallY'), focusTarget![1], 0.3))
  }

  return { update }
}
