import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLive2DExpressionsContext, parseLive2DExpression } from './expressions'

function createExpressions() {
  return createLive2DExpressionsContext({
    getParameterDefault: () => 0,
    isEnabled: () => true,
  })
}

describe('live2D expressions context', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers and removes one inline expression definition', () => {
    const expressions = createExpressions()
    const definition = parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    }))

    const unregister = expressions.register(definition)

    expect(expressions.available.value).toEqual([
      {
        name: 'happy',
        fileName: 'happy.exp3.json',
        parameters: [
          { parameterId: 'ParamEyeSmile', value: 1, blend: 'Add' },
        ],
      },
    ])
    expect(expressions.parameters.value.get('ParamEyeSmile')).toMatchObject({
      blend: 'Add',
      currentValue: 0,
    })

    unregister()
    expect(expressions.available.value).toEqual([])
    expect(expressions.parameters.value.size).toBe(0)
  })

  it('isolates expression state between Live2D roots', () => {
    const first = createExpressions()
    const second = createExpressions()
    const definition = parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    }))

    first.register(definition)
    first.activate('happy')

    expect(first.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(1)
    expect(second.parameters.value.size).toBe(0)
  })

  // https://github.com/moeru-ai/airi/pull/2458#discussion_r4132272685
  // ROOT CAUSE:
  // A model default is not the neutral value for Add or Multiply blending.
  // Registered expressions must leave the model unchanged until activation.
  it('keeps inactive blend values neutral when model defaults are nonzero', () => {
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: parameterId => parameterId === 'ParamAdd' ? 0.25 : 0.5,
      isEnabled: () => true,
    })
    expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [
        { Id: 'ParamAdd', Value: 0.8, Blend: 'Add' },
        { Id: 'ParamMultiply', Value: 0.7, Blend: 'Multiply' },
      ],
    })))

    expect(expressions.parameters.value.get('ParamAdd')).toMatchObject({ currentValue: 0, defaultValue: 0, modelDefault: 0.25 })
    expect(expressions.parameters.value.get('ParamMultiply')).toMatchObject({ currentValue: 1, defaultValue: 1, modelDefault: 0.5 })

    const setParameterValueById = vi.fn()
    expressions.apply({
      getParameterValueById: parameterId => parameterId === 'ParamAdd' ? 0.25 : 0.5,
      setParameterValueById,
    })
    expect(setParameterValueById).not.toHaveBeenCalled()

    expressions.activate('happy')
    expressions.reset()
    expect(expressions.parameters.value.get('ParamAdd')?.currentValue).toBe(0)
    expect(expressions.parameters.value.get('ParamMultiply')?.currentValue).toBe(1)
  })

  // ROOT CAUSE:
  //
  // Cubism 2 expression files store an absolute `val` and a default `def`.
  // The exp3 parser rejected them. Read as absolute values, an `add` with `def: 1` gives `1 + 1`.
  //
  // We fixed this by converting `val` relative to `def`, as the Cubism 2 SDK does.
  it('applies Cubism 2 expressions relative to their defaults, and leaves the model unchanged until activation', () => {
    const values = new Map<string, number>([
      ['PARAM_PART_X', 1],
      ['PARAM_PART_SCALE', 0.5],
      ['PARAM_PART_VISIBLE', 1],
    ])
    const coreModel = {
      getParameterValueById: (parameterId: string) => values.get(parameterId) ?? 0,
      setParameterValueById: vi.fn((parameterId: string, value: number) => {
        values.set(parameterId, value)
      }),
    }
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: parameterId => values.get(parameterId) ?? 0,
      isEnabled: () => true,
    })

    const definition = parseLive2DExpression('parts', 'parts.exp.json', JSON.stringify({
      params: [
        { id: 'PARAM_PART_X', val: 2, def: 1, calc: 'add' },
        { id: 'PARAM_PART_SCALE', val: 1, def: 0.5, calc: 'mult' },
        { id: 'PARAM_PART_VISIBLE', val: 0, def: 1, calc: 'set' },
        // `add` is the default calculation, and a `def` of 0 means no default.
        { id: 'PARAM_PART_Y', val: 0.25 },
        { id: 'PARAM_PART_ALPHA', val: 0.5, def: 0, calc: 'mult' },
      ],
    }))
    expect(definition.parameters).toEqual([
      { parameterId: 'PARAM_PART_X', value: 1, blend: 'Add' },
      { parameterId: 'PARAM_PART_SCALE', value: 2, blend: 'Multiply' },
      { parameterId: 'PARAM_PART_VISIBLE', value: 0, blend: 'Overwrite' },
      { parameterId: 'PARAM_PART_Y', value: 0.25, blend: 'Add' },
      { parameterId: 'PARAM_PART_ALPHA', value: 0.5, blend: 'Multiply' },
    ])

    expressions.register(definition)
    expressions.apply(coreModel)
    expect(coreModel.setParameterValueById).not.toHaveBeenCalled()

    expressions.activate('parts')
    expressions.apply(coreModel)
    expect(values.get('PARAM_PART_X')).toBe(2)
    expect(values.get('PARAM_PART_SCALE')).toBe(1)
    expect(values.get('PARAM_PART_VISIBLE')).toBe(0)

    expressions.reset()
    expressions.apply(coreModel)
    expect(values.get('PARAM_PART_X')).toBe(1)
    expect(values.get('PARAM_PART_SCALE')).toBe(0.5)
    expect(values.get('PARAM_PART_VISIBLE')).toBe(1)
  })

  it('uses the selected preview blend when expressions share a parameter', () => {
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: () => 0.5,
      isEnabled: () => true,
    })
    expressions.register(parseLive2DExpression('add', 'add.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 0.25, Blend: 'Add' }],
    })))
    expressions.register(parseLive2DExpression('multiply', 'multiply.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 0.7, Blend: 'Multiply' }],
    })))

    let rendered = 0.5
    const coreModel = {
      getParameterValueById: () => 0.5,
      setParameterValueById: (_: string, value: number) => { rendered = value },
    }
    expressions.setPreviewExpressions(['add', 'multiply'])
    expressions.apply(coreModel)
    expect(rendered).toBeCloseTo(0.35)
    expect(expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)

    expressions.setPreviewExpressions([])
    expressions.apply(coreModel)
    expect(rendered).toBe(0.5)
  })

  it('uses the activated definition blend when expressions share a parameter', () => {
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: () => 0.5,
      isEnabled: () => true,
    })
    expressions.register(parseLive2DExpression('add', 'add.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 0.25, Blend: 'Add' }],
    })))
    expressions.register(parseLive2DExpression('multiply', 'multiply.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 0.7, Blend: 'Multiply' }],
    })))

    let rendered = 0.5
    const coreModel = {
      getParameterValueById: () => 0.5,
      setParameterValueById: (_: string, value: number) => { rendered = value },
    }
    expressions.activate('multiply')
    expressions.apply(coreModel)
    expect(rendered).toBeCloseTo(0.35)
    expect(expressions.parameters.value.get('ParamEyeSmile')?.activeBlend).toBe('Multiply')

    expressions.reset()
    expressions.activate('add')
    expressions.apply(coreModel)
    expect(rendered).toBe(0.75)
  })

  it('resets an executed expression after its duration', async () => {
    vi.useFakeTimers()
    const expressions = createExpressions()
    const reset = vi.fn(() => true)
    expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [{ Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' }],
    })))
    expressions.setExecutor({
      activate: vi.fn(async () => true),
      reset,
    })

    await expect(expressions.execute({ name: 'happy', duration: 3 })).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(2999)
    expect(reset).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(reset).toHaveBeenCalledOnce()
  })
})
