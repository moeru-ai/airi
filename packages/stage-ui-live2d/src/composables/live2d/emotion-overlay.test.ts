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

  it('should accumulate over frames only through the value it reads back', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const snapshot = ref({ current: { ...NEUTRAL, valence: 0.5 } })
    const plugin = createEmotionOverlayPlugin({ snapshot })
    const offset = resolveEmotionOffsets(snapshot.value.current).ParamMouthForm

    plugin(createContext(model))
    const afterFirst = model.values.get('ParamMouthForm')

    // A fresh frame resets the parameter before plugins run, so a real second
    // frame starts from the model default rather than from the previous write.
    model.values.set('ParamMouthForm', 0)
    plugin(createContext(model))

    expect(afterFirst).toBeCloseTo(offset, 6)
    expect(model.values.get('ParamMouthForm')).toBeCloseTo(offset, 6)
  })
})
