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
    expressions.beginModel('iru')
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
      targetValue: 1,
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

    first.beginModel('first')
    second.beginModel('second')
    first.register(definition)
    first.activate('happy')

    expect(first.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(1)
    expect(second.parameters.value.size).toBe(0)
  })

  it('sets one expression active or inactive without toggling repeated commands', () => {
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: parameterId => parameterId === 'ParamEyeSmile' ? 0.25 : 0.5,
      isEnabled: () => true,
    })
    expressions.beginModel('iru')
    expressions.register(parseLive2DExpression('happy', 'happy.exp3.json', JSON.stringify({
      Parameters: [
        { Id: 'ParamEyeSmile', Value: 1, Blend: 'Add' },
        { Id: 'ParamMouthForm', Value: 0, Blend: 'Overwrite' },
      ],
    })))

    expressions.setActive('happy', true)
    expressions.setActive('happy', true)

    expect(expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(1)
    expect(expressions.parameters.value.get('ParamMouthForm')?.currentValue).toBe(0)

    expressions.setActive('happy', false)
    expressions.setActive('happy', false)

    expect(expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0)
    expect(expressions.parameters.value.get('ParamMouthForm')?.currentValue).toBe(0.5)
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
    expressions.beginModel('iru')
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

    expressions.setActive('happy', true)
    expressions.setActive('happy', false)
    expect(expressions.parameters.value.get('ParamAdd')?.currentValue).toBe(0)
    expect(expressions.parameters.value.get('ParamMultiply')?.currentValue).toBe(1)

    expressions.setActive('happy', true)
    expressions.reset()
    expect(expressions.parameters.value.get('ParamAdd')?.currentValue).toBe(0)
    expect(expressions.parameters.value.get('ParamMultiply')?.currentValue).toBe(1)
  })

  it('uses the selected preview blend when expressions share a parameter', () => {
    const expressions = createLive2DExpressionsContext({
      getParameterDefault: () => 0.5,
      isEnabled: () => true,
    })
    expressions.beginModel('iru')
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
    expressions.beginModel('iru')
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
    expressions.beginModel('iru')
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
