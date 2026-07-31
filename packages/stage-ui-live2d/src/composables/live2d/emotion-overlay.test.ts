import type { MotionManagerPluginContext } from './motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createEmotionOverlayPlugin, resolveEmotionOffsets } from './emotion-overlay'

const NEUTRAL = { valence: 0, arousal: 0, dominance: 0 }

function createModel(declared: string[], initial: Record<string, number> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getParameterIndex: vi.fn((id: string) => declared.indexOf(id)),
    getParameterValueById: vi.fn((id: string) => values.get(id) ?? 0),
    setParameterValueById: vi.fn((id: string, value: number) => {
      values.set(id, value)
    }),
    values,
  }
}

function createContext(model: ReturnType<typeof createModel>): MotionManagerPluginContext {
  return { model, now: 1000, timeDelta: 16 } as unknown as MotionManagerPluginContext
}

describe('resolveEmotionOffsets', () => {
  it('should produce no offsets for a neutral state', () => {
    expect(resolveEmotionOffsets(NEUTRAL)).toEqual({})
  })

  it('should turn positive valence into a positive mouth form', () => {
    const offsets = resolveEmotionOffsets({ ...NEUTRAL, valence: 0.5 })
    expect(offsets.ParamMouthForm).toBeGreaterThan(0)
  })

  it('should flip the mouth form sign with valence', () => {
    const happy = resolveEmotionOffsets({ ...NEUTRAL, valence: 0.5 })
    const sad = resolveEmotionOffsets({ ...NEUTRAL, valence: -0.5 })
    expect(sad.ParamMouthForm).toBeCloseTo(-happy.ParamMouthForm, 6)
  })

  it('should widen the eyes with arousal', () => {
    const offsets = resolveEmotionOffsets({ ...NEUTRAL, arousal: 1 })
    expect(offsets.ParamEyeLOpen).toBeGreaterThan(0)
    expect(offsets.ParamEyeROpen).toBeCloseTo(offsets.ParamEyeLOpen, 6)
  })

  it('should raise the chin with dominance and lower it without', () => {
    expect(resolveEmotionOffsets({ ...NEUTRAL, dominance: 1 }).ParamAngleY).toBeGreaterThan(0)
    expect(resolveEmotionOffsets({ ...NEUTRAL, dominance: -1 }).ParamAngleY).toBeLessThan(0)
  })

  // Mouth aperture belongs to lipsync; anything written here would fight it.
  it('should never emit a mouth aperture offset', () => {
    const extreme = { valence: 1, arousal: 1, dominance: 1 }
    expect(Object.keys(resolveEmotionOffsets(extreme))).not.toContain('ParamMouthOpenY')
  })

  // This layer is a mood floor, not a performance — it must not be able to
  // overpower an authored expression even at a saturated state.
  it('should keep every offset within its ceiling', () => {
    const extreme = { valence: 1, arousal: 1, dominance: 1 }

    for (const [id, value] of Object.entries(resolveEmotionOffsets(extreme))) {
      const limit = id.startsWith('ParamAngle') ? 8 : 0.25
      expect(Math.abs(value)).toBeLessThanOrEqual(limit)
    }
  })
})

describe('createEmotionOverlayPlugin', () => {
  it('should add its offset to the value the frame already produced', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.4 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })

    createEmotionOverlayPlugin({ snapshot })(createContext(model))

    const expected = 0.4 + resolveEmotionOffsets(snapshot.value.current).ParamMouthForm
    expect(model.values.get('ParamMouthForm')).toBeCloseTo(expected, 6)
  })

  // A rig without brow parameters should lose the brow contribution, not throw
  // or have a wrong baseline baked into an undeclared parameter.
  it('should skip parameters the model does not declare', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { valence: 0.5, arousal: 0.5, dominance: 0.5 } })

    createEmotionOverlayPlugin({ snapshot })(createContext(model))

    expect(model.setParameterValueById).toHaveBeenCalledTimes(1)
    expect(model.setParameterValueById).toHaveBeenCalledWith('ParamMouthForm', expect.any(Number))
  })

  it('should write nothing while the state is neutral', () => {
    const model = createModel(['ParamMouthForm', 'ParamAngleY'])
    const snapshot = ref({ current: { ...NEUTRAL } })

    createEmotionOverlayPlugin({ snapshot })(createContext(model))

    expect(model.setParameterValueById).not.toHaveBeenCalled()
  })

  it('should write nothing while disabled', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.9 } })

    createEmotionOverlayPlugin({ snapshot, enabled: ref(false) })(createContext(model))

    expect(model.setParameterValueById).not.toHaveBeenCalled()
  })

  // A parameter no motion keys is not reset between frames, so reading it back
  // returns this overlay's own previous output. Without a record of what was
  // written the offset compounds every frame — 0.11 becomes 6.6 within a
  // second at 60fps.
  it('should hold steady over many frames when nothing else touches the parameter', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const plugin = createEmotionOverlayPlugin({ snapshot })
    const offset = resolveEmotionOffsets(snapshot.value.current).ParamMouthForm

    const ctx = createContext(model)
    for (let frame = 0; frame < 60; frame++)
      plugin(ctx)

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(offset, 6)
  })

  it('should layer onto the value a motion produced this frame', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const plugin = createEmotionOverlayPlugin({ snapshot })
    const offset = resolveEmotionOffsets(snapshot.value.current).ParamMouthForm

    plugin(createContext(model))
    // A motion keys the parameter on the next frame.
    model.values.set('ParamMouthForm', 0.6)
    plugin(createContext(model))

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.6 + offset, 6)
  })

  // Same transition the expression controller handles: a parameter written
  // last frame and not written this frame has to be put back, or the last mood
  // stays frozen on the model forever.
  it('should restore the parameter when the state returns to neutral', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.2 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const plugin = createEmotionOverlayPlugin({ snapshot })

    plugin(createContext(model))
    expect(model.values.get('ParamMouthForm')).not.toBeCloseTo(0.2, 6)

    snapshot.value = { current: { ...NEUTRAL } }
    plugin(createContext(model))

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.2, 6)
  })

  it('should restore the parameter when it is switched off', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.2 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const enabled = ref(true)
    const plugin = createEmotionOverlayPlugin({ snapshot, enabled })

    plugin(createContext(model))
    enabled.value = false
    plugin(createContext(model))

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.2, 6)
  })

  // If something else claimed the parameter after our write, that newer value
  // is the one that should stand — undoing our contribution would clobber it.
  it('should not undo its contribution once another writer has claimed the parameter', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const plugin = createEmotionOverlayPlugin({ snapshot })

    plugin(createContext(model))
    model.values.set('ParamMouthForm', 0.9)

    snapshot.value = { current: { ...NEUTRAL } }
    plugin(createContext(model))

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.9, 6)
  })
})
