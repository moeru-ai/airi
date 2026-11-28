import type { Live2DInputBinding, Live2DInputMapping } from '../../controls/input-mapping'

import { describe, expect, it, vi } from 'vitest'

import { Live2DInputMapper } from './input-mapping'

function createModel(initialValues: Record<string, number>) {
  const values = new Map(Object.entries(initialValues))
  return {
    values,
    getParameterValueById: vi.fn((id: string) => {
      if (!values.has(id))
        values.set(id, 0)
      return values.get(id)!
    }),
    setParameterValueById: vi.fn((id: string, value: number, weight = 1) => {
      values.set(id, (values.get(id) ?? 0) * (1 - weight) + value * weight)
    }),
    addParameterValueById: vi.fn((id: string, value: number, weight = 1) => {
      values.set(id, (values.get(id) ?? 0) + value * weight)
    }),
    multiplyParameterValueById: vi.fn((id: string, value: number, weight = 1) => {
      values.set(id, (values.get(id) ?? 0) * (1 + (value - 1) * weight))
    }),
    hasParameter(id: string) {
      return this.values.has(id)
    },
  }
}

function binding(overrides: Partial<Live2DInputBinding> = {}): Live2DInputBinding {
  return {
    source: 'ParamAngleX',
    target: 'ParamTurnInput',
    sourceScale: 1,
    sourceOffset: 0,
    inputMin: -30,
    inputMax: 30,
    outputMin: -10,
    outputMax: 10,
    clampInput: true,
    clampOutput: true,
    smoothing: 0,
    physicsOutputs: ['ParamBodyAngleX'],
    ...overrides,
  }
}

function mapping(bindings: Live2DInputBinding[] = [binding()]): Live2DInputMapping {
  return {
    status: 'ready',
    bindings,
    physicsOutputs: ['ParamBodyAngleX'],
    issues: [],
  }
}

describe('live2D input mapper', () => {
  it('commits input values after SDK saving so repeated frames do not feed transformed results back into controls', () => {
    const original = createModel({ ParamAngleX: 0, ParamBodyAngleX: 0 })
    const mapper = new Live2DInputMapper(original, mapping([binding({ target: 'ParamAngleX' })]), [...original.values.keys()])
    mapper.setBaseParameterValue('ParamAngleX', 0)
    for (let frame = 0; frame < 3; frame++) {
      mapper.beginFrame(true)
      mapper.model.addParameterValueById('ParamAngleX', 15)
      const savedParameters = new Map(original.values)
      expect(original.values.get('ParamAngleX')).toBe(0)
      mapper.flush()
      expect(original.values.get('ParamAngleX')).toBe(5)
      // Physics reads the committed input before the SDK restores the saved parameters.
      original.setParameterValueById('ParamBodyAngleX', original.getParameterValueById('ParamAngleX') * 2)
      expect(original.values.get('ParamBodyAngleX')).toBe(10)
      for (const [id, value] of savedParameters)
        original.values.set(id, value)
    }
  })

  it('keeps direct controls unchanged while the model mapping is disabled', () => {
    const original = createModel({ ParamAngleX: 0, ParamTurnInput: 0, ParamBodyAngleX: 0 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(false)
    mapper.model.setParameterValueById('ParamAngleX', 20, 0.5)
    mapper.model.addParameterValueById('ParamAngleX', 4, 0.5)
    mapper.model.multiplyParameterValueById('ParamAngleX', 2, 0.5)

    mapper.flush()

    expect(original.values.get('ParamAngleX')).toBe(18)
    expect(original.values.get('ParamTurnInput')).toBe(0)
    expect(original.setParameterValueById).toHaveBeenCalledWith('ParamAngleX', 20, 0.5)
    expect(original.addParameterValueById).toHaveBeenCalledWith('ParamAngleX', 4, 0.5)
    expect(original.multiplyParameterValueById).toHaveBeenCalledWith('ParamAngleX', 2, 0.5)
  })

  it('routes canonical controls into author inputs and preserves the physics destinations', () => {
    const original = createModel({ ParamAngleX: 0, ParamTurnInput: 0, ParamBodyAngleX: 7, ParamBreath: 0 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamAngleX', 15)
    mapper.model.setParameterValueById('ParamBodyAngleX', -10)
    mapper.model.setParameterValueById('ParamBreath', 0.4)

    mapper.flush()

    expect(original.values.get('ParamTurnInput')).toBe(5)
    expect(original.values.get('ParamAngleX')).toBe(0)
    expect(original.values.get('ParamBodyAngleX')).toBe(7)
    expect(original.values.get('ParamBreath')).toBe(0.4)
    expect(mapper.model.getParameterValueById('ParamBodyAngleX')).toBe(-10)
    expect(mapper.model.hasParameter('ParamTurnInput')).toBe(true)
  })

  it('composes weighted AIRI layers once before distributing them to multiple targets', () => {
    const original = createModel({ ParamAngleX: 0, ParamTurnInput: 0, ParamSecondInput: 0 })
    const mapper = new Live2DInputMapper(original, mapping([
      binding(),
      binding({ target: 'ParamSecondInput', outputMin: 1, outputMax: -1 }),
    ]), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamAngleX', 30, 0.5)
    mapper.model.addParameterValueById('ParamAngleX', 10, 0.5)
    mapper.model.multiplyParameterValueById('ParamAngleX', 0, 0.5)

    mapper.flush()

    expect(mapper.model.getParameterValueById('ParamAngleX')).toBe(10)
    expect(original.values.get('ParamTurnInput')).toBeCloseTo(10 / 3)
    expect(original.values.get('ParamSecondInput')).toBeCloseTo(-1 / 3)
    expect(original.values.get('ParamAngleX')).toBe(0)
  })

  it('supports range reversal, source conversion, and extrapolation only when the binding allows it', () => {
    const original = createModel({ ParamMouthForm: 0, ParamSmileInput: 0, ParamUnclamped: 0 })
    const mapper = new Live2DInputMapper(original, mapping([
      binding({ source: 'ParamMouthForm', target: 'ParamSmileInput', sourceScale: 0.5, sourceOffset: 0.5, inputMin: 0, inputMax: 1, outputMin: 1, outputMax: 0 }),
      binding({ source: 'ParamMouthForm', target: 'ParamUnclamped', sourceScale: 0.5, sourceOffset: 0.5, inputMin: 0, inputMax: 1, outputMin: 1, outputMax: 0, clampInput: false, clampOutput: false }),
    ]), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamMouthForm', 0)
    mapper.flush()

    expect(original.values.get('ParamSmileInput')).toBe(0.5)

    mapper.model.setParameterValueById('ParamMouthForm', 3)
    mapper.flush()
    expect(original.values.get('ParamSmileInput')).toBe(0)
    expect(original.values.get('ParamUnclamped')).toBe(-1)
  })

  it('does not synthesize an absent canonical parameter when custom inputs exist', () => {
    const original = createModel({ ParamTurnInput: 0 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.addParameterValueById('ParamAngleX', 12)

    mapper.flush()

    expect(original.values.get('ParamTurnInput')).toBe(4)
    expect(original.values.has('ParamAngleX')).toBe(false)
    expect(original.getParameterValueById).not.toHaveBeenCalledWith('ParamAngleX')
  })

  it('ignores absent targets without claiming their physics outputs', () => {
    const original = createModel({ ParamTurnInput: 0, ParamEyeLOpen: 1, ParamBodyAngleX: 7 })
    const mapper = new Live2DInputMapper(original, mapping([
      binding({ source: 'ParamEyeLOpen', target: 'ParamTurnInput', physicsOutputs: [] }),
      binding({ target: 'ParamAbsent', physicsOutputs: ['ParamBodyAngleX'] }),
    ]), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamBodyAngleX', 3)

    mapper.flush()

    expect(mapper.mapping.bindings).toHaveLength(1)
    expect(mapper.mapping.issues).toContain('missing-parameters')
    expect(mapper.mapping.physicsOutputs).toEqual([])
    expect(original.values.has('ParamAbsent')).toBe(false)
    expect(original.values.get('ParamBodyAngleX')).toBe(3)
  })

  it('reports unsupported mappings when none of the author targets exist', () => {
    const original = createModel({ ParamAngleX: 0 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamAngleX', 15)

    mapper.flush()

    expect(mapper.mapping.status).toBe('unsupported')
    expect(original.values.get('ParamAngleX')).toBe(15)
    expect(original.values.has('ParamTurnInput')).toBe(false)
  })

  it('restores input baselines when disabled and removes previous virtual controls', () => {
    const original = createModel({ ParamAngleX: 2, ParamTurnInput: 1 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamAngleX', 30)
    mapper.flush()
    mapper.beginFrame(false)

    mapper.flush()

    expect(original.values.get('ParamTurnInput')).toBe(1)
    expect(mapper.model.getParameterValueById('ParamAngleX')).toBe(2)

    mapper.model.setParameterValueById('ParamAngleX', 9)
    mapper.beginFrame(true)
    expect(mapper.model.getParameterValueById('ParamAngleX')).toBe(9)
  })

  it('preserves raw authored updates after AIRI writes and resets virtual values at the next frame', () => {
    const original = createModel({ ParamAngleX: 0, ParamTurnInput: 0 })
    const mapper = new Live2DInputMapper(original, mapping(), [...original.values.keys()])
    mapper.beginFrame(true)
    mapper.model.setParameterValueById('ParamAngleX', 30)
    mapper.flush()
    original.setParameterValueById('ParamTurnInput', -4)
    original.setParameterValueById('ParamAngleX', 3)
    mapper.beginFrame(true)

    mapper.flush()

    expect(mapper.model.getParameterValueById('ParamAngleX')).toBe(3)
    mapper.reset()
    expect(original.values.get('ParamTurnInput')).toBe(-4)
    expect(original.values.get('ParamAngleX')).toBe(3)
  })
})
