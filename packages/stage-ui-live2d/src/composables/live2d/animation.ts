import type { InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import { MathUtils } from 'three'

import { randomSaccadeInterval } from '../../utils'

export interface Live2DIdleEyeFocusOptions {
  /**
   * When true, suppress random eye saccades and focus eyes at center (looking at user).
   * Useful during speech to make the character appear engaged in conversation.
   */
  nowSpeaking?: Ref<boolean>
}

/**
 * This is to simulate idle eye saccades and focus (head) movements in a *pretty* naive way.
 * Not using any reactivity here as it's not yet needed.
 * Keeping it here as a composable for future extension.
 */
export function useLive2DIdleEyeFocus(options?: Live2DIdleEyeFocusOptions) {
  let nextSaccadeAfter = -1
  let focusTarget: [number, number] | undefined
  let lastSaccadeAt = -1

  // Function to handle idle eye saccades and focus (head) movements
  function update(model: InternalModel, now: number) {
    const speaking = options?.nowSpeaking?.value ?? false

    if (speaking) {
      // During speech: smoothly return eyes to center (looking at user)
      const coreModel = model.coreModel as any
      const centerTarget: [number, number] = [0, 0]
      if (!focusTarget || focusTarget[0] !== 0 || focusTarget[1] !== 0) {
        focusTarget = centerTarget
        model.focusController.focus(0, 0, false)
        lastSaccadeAt = now
      }
      model.focusController.update(now - lastSaccadeAt)
      coreModel.setParameterValueById('ParamEyeBallX', MathUtils.lerp(coreModel.getParameterValueById('ParamEyeBallX'), 0, 0.15))
      coreModel.setParameterValueById('ParamEyeBallY', MathUtils.lerp(coreModel.getParameterValueById('ParamEyeBallY'), 0, 0.15))
      // Reset saccade timer so it resumes naturally after speech ends
      nextSaccadeAfter = -1
      return
    }

    if (now >= nextSaccadeAfter || now < lastSaccadeAt) {
      focusTarget = [MathUtils.randFloat(-1, 1), MathUtils.randFloat(-1, 0.7)]
      lastSaccadeAt = now
      nextSaccadeAfter = now + (randomSaccadeInterval() / 1000)
      model.focusController.focus(focusTarget![0] * 0.5, focusTarget![1] * 0.5, false)
    }

    model.focusController.update(now - lastSaccadeAt)
    const coreModel = model.coreModel as any
    // TODO: After emotion mapper, stage editor, eye related parameters should be take cared to be dynamical instead of hardcoding
    coreModel.setParameterValueById('ParamEyeBallX', MathUtils.lerp(coreModel.getParameterValueById('ParamEyeBallX'), focusTarget![0], 0.3))
    coreModel.setParameterValueById('ParamEyeBallY', MathUtils.lerp(coreModel.getParameterValueById('ParamEyeBallY'), focusTarget![1], 0.3))
  }

  return { update }
}
