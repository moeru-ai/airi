import { describe, expect, it, vi } from 'vitest'

import { adaptInternalModel, initializeCubism2Model } from './model'

/**
 * Minimal stand-in for `Live2DModelWebGL`, backed by a plain map so tests can
 * mutate parameter values between the adapt call and the assertions.
 */
function createCubism2Core(values: Map<string, number>, update = () => {}) {
  return {
    getParamFloat: (id: string | number) => values.get(String(id)) ?? 0,
    getParamIndex: () => 0,
    setParamFloat: (id: string | number, value: number) => values.set(String(id), value),
    update,
  }
}

describe('legacy Live2D model adapter', () => {
  it('initializes Cubism 2 deformers before the first Stage draw', () => {
    // ROOT CAUSE:
    //
    // Cubism 2 leaves drawable vertices in their raw ArtMesh positions until
    // `coreModel.update()` runs. Stage can render before the model's shared
    // ticker, exposing detached arms and accessories on that first frame.
    //
    // initializeCubism2Model now performs the required initial core update during
    // setup, before PIXI can add the model to the Stage render tree.
    const calls: string[] = []
    const update = vi.fn(() => calls.push('update'))
    const updateWebGLContext = vi.fn(() => calls.push('context'))
    const gl = {} as WebGLRenderingContext

    initializeCubism2Model(
      { coreModel: createCubism2Core(new Map(), update), updateWebGLContext },
      { CONTEXT_UID: 7, gl },
    )

    expect(updateWebGLContext).toHaveBeenCalledWith(gl, 7)
    expect(update).toHaveBeenCalledOnce()
    expect(calls).toEqual(['context', 'update'])
  })

  it('maps AIRI parameter IDs onto the Cubism 2 core API', () => {
    const values = new Map<string, number>([
      ['PARAM_ANGLE_X', 3],
      ['PARAM_MOUTH_FORM_01', 0.25],
    ])
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(values),
      settings: { initParams: [{ id: 'PARAM_MOUTH_FORM_01' }] },
    })

    expect(internalModel.coreModel.getParameterValueById('ParamAngleX')).toBe(3)
    expect(internalModel.coreModel.getParameterValueById('PARAM_MOUTH_FORM_01')).toBe(0.25)

    internalModel.coreModel.setParameterValueById('ParamMouthForm', 0.75)

    expect(values.get('PARAM_MOUTH_FORM_01')).toBe(0.75)
    expect(internalModel.coreModel.getParameterDefaultValueById?.('ParamAngleX')).toBe(3)
  })

  it('writes both eye smile parameters through their own native IDs', () => {
    const values = new Map<string, number>()
    const internalModel = adaptInternalModel({ coreModel: createCubism2Core(values) })

    internalModel.coreModel.setParameterValueById('ParamEyeRSmile', 1)
    internalModel.coreModel.setParameterValueById('ParamEyeLSmile', 0.5)

    expect(values.get('PARAM_EYE_R_SMILE')).toBe(1)
    expect(values.get('PARAM_EYE_L_SMILE')).toBe(0.5)
  })

  it('snapshots defaults eagerly instead of on first read', () => {
    // ROOT CAUSE:
    //
    // Defaults used to be captured on the first `getParameterValueById` call.
    // Model.vue awaits its expression controller init inside a `finally` block
    // after the model is already ticking, so that first read happened
    // mid-animation and Add-blend expressions anchored to a noisy value:
    //
    //   if (!defaults.has(resolvedId)) defaults.set(resolvedId, value)  // on read
    //
    // adaptInternalModel now snapshots the rest pose while it is still frozen
    // by Cubism2InternalModel.init() -> coreModel.saveParam(), so later
    // animation values can no longer be mistaken for the model default.
    const values = new Map<string, number>([['PARAM_ANGLE_X', 5]])
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(values),
      settings: { initParams: [{ id: 'PARAM_ANGLE_X' }] },
    })

    // The model starts ticking and drives the parameter away from its rest pose.
    values.set('PARAM_ANGLE_X', 9)

    expect(internalModel.coreModel.getParameterValueById('ParamAngleX')).toBe(9)
    expect(internalModel.coreModel.getParameterDefaultValueById?.('ParamAngleX')).toBe(5)
    expect(internalModel.coreModel.getParameterDefaultValueById?.('PARAM_ANGLE_X')).toBe(5)
  })

  it('snapshots defaults for IDs that only expression files reference', () => {
    const values = new Map<string, number>([['PARAM_EYELID_R', -0.06]])
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(values),
      settings: {
        _expFiles: [
          { data: { params: [{ id: 'PARAM_EYELID_R', val: -0.06 }] } },
        ],
      },
    })

    values.set('PARAM_EYELID_R', 0.8)

    expect(internalModel.coreModel.getParameterValueById('PARAM_EYELID_R')).toBe(0.8)
    expect(internalModel.coreModel.getParameterDefaultValueById?.('PARAM_EYELID_R')).toBe(-0.06)
  })

  it('snapshots defaults for IDs listed in settings.initParams', () => {
    const values = new Map<string, number>([['PARAM_HAIR_SIDE', 0.4]])
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(values),
      settings: { initParams: [{ id: 'PARAM_HAIR_SIDE', value: 0.4 }] },
    })

    values.set('PARAM_HAIR_SIDE', -1)

    expect(internalModel.coreModel.getParameterDefaultValueById?.('PARAM_HAIR_SIDE')).toBe(0.4)
  })

  it('falls back to the first observed value for IDs discovered after adapting', () => {
    const values = new Map<string, number>([['PARAM_UNLISTED', 2]])
    const internalModel = adaptInternalModel({ coreModel: createCubism2Core(values) })

    expect(internalModel.coreModel.getParameterValueById('PARAM_UNLISTED')).toBe(2)

    values.set('PARAM_UNLISTED', 7)

    expect(internalModel.coreModel.getParameterValueById('PARAM_UNLISTED')).toBe(7)
    expect(internalModel.coreModel.getParameterDefaultValueById?.('PARAM_UNLISTED')).toBe(2)
  })

  it('clears the unusable Cubism 2 eye blink so AIRI drives blinking', () => {
    const eyeBlink = { update: () => {} }
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(new Map<string, number>()),
      eyeBlink,
    })

    expect(internalModel.eyeBlink).toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/2197#discussion_r2255381307
  it('pR #2197 uses the standard mouth-form ID by default', () => {
    const values = new Map<string, number>([['PARAM_MOUTH_FORM', 0.25]])
    const internalModel = adaptInternalModel({ coreModel: createCubism2Core(values) })

    expect(internalModel.coreModel.getParameterValueById('ParamMouthForm')).toBe(0.25)
    expect(values.has('PARAM_MOUTH_FORM_01')).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2197#discussion_r2255381307
  it('pR #2197 uses a model-specific mouth-form ID only when settings declare it', () => {
    const values = new Map<string, number>([['PARAM_MOUTH_FORM_01', 0.75]])
    const internalModel = adaptInternalModel({
      coreModel: createCubism2Core(values),
      settings: { initParams: [{ id: 'PARAM_MOUTH_FORM_01' }] },
    })

    expect(internalModel.coreModel.getParameterValueById('ParamMouthForm')).toBe(0.75)
    expect(values.has('PARAM_MOUTH_FORM')).toBe(false)
  })

  it('leaves a Cubism 3+ core model unchanged', () => {
    const coreModel = {
      getParameterValueById: () => 1,
      setParameterValueById: () => {},
    }
    const eyeBlink = { updateParameters: () => {} }

    const internalModel = adaptInternalModel({ coreModel, eyeBlink })

    expect(internalModel.coreModel).toBe(coreModel)
    expect(internalModel.eyeBlink).toBe(eyeBlink)
  })
})
