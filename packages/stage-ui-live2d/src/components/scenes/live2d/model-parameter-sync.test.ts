import type { Live2DModel as PixiLive2DModel } from 'pixi-live2d-display'

import type { PixiLive2DInternalModel } from '../../../composables/live2d/motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'

import { defaultModelParameters } from '../../../stores/model-parameters'
import { useModelParameterSync } from './model-parameter-sync'

describe('model parameter synchronization', () => {
  // https://github.com/moeru-ai/airi/pull/2197
  it('applies distinct eye smiles during setup and after stored values change', async () => {
    const setParameterValueById = vi.fn()
    const coreModel = { setParameterValueById } as unknown as PixiLive2DInternalModel['coreModel']
    const model = shallowRef({
      internalModel: { coreModel },
    } as unknown as PixiLive2DModel<PixiLive2DInternalModel>)
    const modelParameters = ref<Record<string, number>>({
      ...defaultModelParameters,
      leftEyeSmile: 0.25,
      rightEyeSmile: 0.75,
    })
    const applyStoredModelParameters = useModelParameterSync(model, modelParameters)

    // ROOT CAUSE:
    //
    // Model setup wrote only leftEyeSmile through unsupported ParamEyeSmile.
    // It also had no watchers for either stored eye-smile value.
    //
    // One binding list now drives setup and reactive updates through the two
    // semantic aliases supported by both generation adapters.
    applyStoredModelParameters(coreModel)

    expect(setParameterValueById).toHaveBeenCalledWith('ParamEyeLSmile', 0.25)
    expect(setParameterValueById).toHaveBeenCalledWith('ParamEyeRSmile', 0.75)
    expect(setParameterValueById).not.toHaveBeenCalledWith('ParamEyeSmile', expect.any(Number))

    setParameterValueById.mockClear()
    modelParameters.value.leftEyeSmile = 0.4
    modelParameters.value.rightEyeSmile = 0.8
    await nextTick()

    expect(setParameterValueById).toHaveBeenCalledWith('ParamEyeLSmile', 0.4)
    expect(setParameterValueById).toHaveBeenCalledWith('ParamEyeRSmile', 0.8)
    expect(setParameterValueById).not.toHaveBeenCalledWith('ParamEyeSmile', expect.any(Number))
  })
})
