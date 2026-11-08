import type { Live2DModel as PixiLive2DModel } from 'pixi-live2d-display'
import type { Ref } from 'vue'

import type { PixiLive2DInternalModel } from '../../../composables/live2d/motion-manager'

import { watch } from 'vue'

const modelParameterBindings = [
  ['angleX', 'ParamAngleX'],
  ['angleY', 'ParamAngleY'],
  ['angleZ', 'ParamAngleZ'],
  ['leftEyeOpen', 'ParamEyeLOpen'],
  ['rightEyeOpen', 'ParamEyeROpen'],
  ['leftEyeSmile', 'ParamEyeLSmile'],
  ['rightEyeSmile', 'ParamEyeRSmile'],
  ['leftEyebrowLR', 'ParamBrowLX'],
  ['rightEyebrowLR', 'ParamBrowRX'],
  ['leftEyebrowY', 'ParamBrowLY'],
  ['rightEyebrowY', 'ParamBrowRY'],
  ['leftEyebrowAngle', 'ParamBrowLAngle'],
  ['rightEyebrowAngle', 'ParamBrowRAngle'],
  ['leftEyebrowForm', 'ParamBrowLForm'],
  ['rightEyebrowForm', 'ParamBrowRForm'],
  ['mouthOpen', 'ParamMouthOpenY'],
  ['mouthForm', 'ParamMouthForm'],
  ['cheek', 'ParamCheek'],
  ['bodyAngleX', 'ParamBodyAngleX'],
  ['bodyAngleY', 'ParamBodyAngleY'],
  ['bodyAngleZ', 'ParamBodyAngleZ'],
  ['breath', 'ParamBreath'],
] as const

/**
 * Keeps stored model parameters synchronized with their semantic Live2D IDs.
 *
 * The returned function applies the latest snapshot after each model load.
 * Watchers update only the loaded model and belong to the caller's Vue scope.
 */
export function useModelParameterSync(
  model: Ref<PixiLive2DModel<PixiLive2DInternalModel> | undefined>,
  modelParameters: Ref<Record<string, number>>,
) {
  function applyStoredModelParameters(coreModel: PixiLive2DInternalModel['coreModel']) {
    for (const [storedParameter, live2DParameter] of modelParameterBindings)
      coreModel.setParameterValueById(live2DParameter, modelParameters.value[storedParameter])
  }

  for (const [storedParameter, live2DParameter] of modelParameterBindings) {
    watch(() => modelParameters.value[storedParameter], (value) => {
      model.value?.internalModel.coreModel.setParameterValueById(live2DParameter, value)
    })
  }

  return applyStoredModelParameters
}
