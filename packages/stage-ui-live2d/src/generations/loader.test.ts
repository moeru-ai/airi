import { describe, expect, it } from 'vitest'

import { disableIdleEyeMovement, selectLive2DSettings } from './loader'

describe('live2D generation settings selection', () => {
  it('selects valid Cubism 2 settings', () => {
    expect(selectLive2DSettings([{ path: 'model/model.model.json', json: { model: 'model.moc', textures: ['model.png'] } }]).loader.generation).toBe('cubism2')
  })

  it('selects valid Cubism 4 settings', () => {
    expect(selectLive2DSettings([{ path: 'model/model.model3.json', json: { FileReferences: { Moc: 'model.moc3', Textures: ['model.png'] } } }]).loader.generation).toBe('cubism4')
  })

  it('does not claim a settings-looking path with an incompatible body', () => {
    expect(() => selectLive2DSettings([{ path: 'unrelated.model.json', json: { message: 'hello' } }])).toThrow(/found 0/)
  })

  it('rejects multiple valid entry points', () => {
    expect(() => selectLive2DSettings([
      { path: 'legacy.model.json', json: { model: 'legacy.moc', textures: ['legacy.png'] } },
      { path: 'modern.model3.json', json: { FileReferences: { Moc: 'modern.moc3', Textures: ['modern.png'] } } },
    ])).toThrow(/found 2/)
  })
})

describe('live2D generation motion preparation', () => {
  // https://github.com/moeru-ai/airi/pull/2197
  it('keeps Cubism 2 idle motions without Cubism 4 curve data for PR #2197', () => {
    const motion = {}
    const model = {
      coreModel: {
        getParamFloat: () => 0,
        setParamFloat: () => {},
      },
      motionManager: {
        groups: { idle: 'idle' },
        motionGroups: { idle: [motion] },
      },
    }

    expect(() => disableIdleEyeMovement(model)).not.toThrow()
    expect(model.motionManager.motionGroups.idle[0]).toBe(motion)
  })

  // https://github.com/moeru-ai/airi/pull/2197
  it('keeps the Cubism 4 idle eye-curve rewrite for PR #2197', () => {
    const eyeX = { id: 'ParamEyeBallX' }
    const eyeY = { id: 'ParamEyeBallY' }
    const angle = { id: 'ParamAngleX' }
    const model = {
      coreModel: {},
      motionManager: {
        groups: { idle: 'Idle' },
        motionGroups: {
          Idle: [{ _motionData: { curves: [eyeX, eyeY, angle] } }],
        },
      },
    }

    disableIdleEyeMovement(model)

    expect(eyeX.id).toBe('_ParamEyeBallX')
    expect(eyeY.id).toBe('_ParamEyeBallY')
    expect(angle.id).toBe('ParamAngleX')
  })
})
