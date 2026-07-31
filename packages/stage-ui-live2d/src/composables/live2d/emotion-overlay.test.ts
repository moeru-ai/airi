import type { MotionManagerPluginContext } from './motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createEmotionOverlayPlugins, resolveEmotionOffsets } from './emotion-overlay'

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

describe('createEmotionOverlayPlugins', () => {
  function runFrame(
    overlay: ReturnType<typeof createEmotionOverlayPlugins>,
    model: ReturnType<typeof createModel>,
  ) {
    overlay.restore(createContext(model))
    overlay.apply(createContext(model))
  }

  it('should layer its offset onto the value the frame produced', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.4 })
    const vad = ref({ ...NEUTRAL, valence: 0.5 })

    runFrame(createEmotionOverlayPlugins({ reading: () => vad.value }), model)

    const expected = 0.4 + resolveEmotionOffsets(vad.value).ParamMouthForm
    expect(model.values.get('ParamMouthForm')).toBeCloseTo(expected, 6)
  })

  // A parameter no motion keys is not reset between frames. Without the restore
  // stage the overlay would read back its own output and compound: a 0.11
  // offset reaches 6.6 within a second at 60fps.
  it('should hold steady over many frames when nothing else touches the parameter', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const vad = ref({ ...NEUTRAL, valence: 0.5 })
    const overlay = createEmotionOverlayPlugins({ reading: () => vad.value })
    const offset = resolveEmotionOffsets(vad.value).ParamMouthForm

    for (let frame = 0; frame < 60; frame++)
      runFrame(overlay, model)

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(offset, 6)
  })

  it('should follow a motion that rewrites the parameter each frame', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const vad = ref({ ...NEUTRAL, valence: 0.5 })
    const overlay = createEmotionOverlayPlugins({ reading: () => vad.value })
    const offset = resolveEmotionOffsets(vad.value).ParamMouthForm

    overlay.restore(createContext(model))
    model.values.set('ParamMouthForm', 0.6)
    overlay.apply(createContext(model))

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.6 + offset, 6)
  })

  it('should give the parameter back when the state returns to neutral', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.2 })
    const vad = ref({ ...NEUTRAL, valence: 0.5 })
    const overlay = createEmotionOverlayPlugins({ reading: () => vad.value })

    runFrame(overlay, model)
    expect(model.values.get('ParamMouthForm')).not.toBeCloseTo(0.2, 6)

    vad.value = { ...NEUTRAL }
    runFrame(overlay, model)

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.2, 6)
  })

  it('should give the parameter back when it is switched off', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0.2 })
    const vad = ref({ ...NEUTRAL, valence: 0.5 })
    const enabled = ref(true)
    const overlay = createEmotionOverlayPlugins({ reading: () => vad.value, enabled: () => enabled.value })

    runFrame(overlay, model)
    enabled.value = false
    runFrame(overlay, model)

    expect(model.values.get('ParamMouthForm')).toBeCloseTo(0.2, 6)
  })

  // The model clamps to a parameter's declared range, so the value it keeps is
  // not always the one written. Restoring from the recorded base rather than
  // from a readback means the clamp cannot strand the parameter at its ceiling.
  it('should give the parameter back even when the model clamped the write', () => {
    const values = new Map([['ParamEyeLOpen', 0.95]])
    const model = {
      getParameterIndex: vi.fn(() => 0),
      getParameterValueById: vi.fn((id: string) => values.get(id) ?? 0),
      setParameterValueById: vi.fn((id: string, value: number) => {
        values.set(id, Math.min(Math.max(value, 0), 1))
      }),
      values,
    } as unknown as ReturnType<typeof createModel>
    const vad = ref({ ...NEUTRAL, arousal: 0.8 })
    const overlay = createEmotionOverlayPlugins({ reading: () => vad.value })

    runFrame(overlay, model)
    expect(values.get('ParamEyeLOpen')).toBe(1)

    vad.value = { ...NEUTRAL }
    runFrame(overlay, model)

    expect(values.get('ParamEyeLOpen')).toBeCloseTo(0.95, 6)
  })

  it('should skip parameters the model does not declare', () => {
    const model = createModel(['ParamMouthForm'], { ParamMouthForm: 0 })
    const vad = ref({ valence: 0.5, arousal: 0.5, dominance: 0.5 })

    createEmotionOverlayPlugins({ reading: () => vad.value }).apply(createContext(model))

    expect(model.setParameterValueById).toHaveBeenCalledTimes(1)
    expect(model.setParameterValueById).toHaveBeenCalledWith('ParamMouthForm', expect.any(Number))
  })

  it('should write nothing while the state is neutral', () => {
    const model = createModel(['ParamMouthForm', 'ParamAngleY'])
    const vad = ref({ ...NEUTRAL })

    createEmotionOverlayPlugins({ reading: () => vad.value }).apply(createContext(model))

    expect(model.setParameterValueById).not.toHaveBeenCalled()
  })
})
