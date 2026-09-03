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

    expect(expressions.parameters.value.get('ParamEyeSmile')?.currentValue).toBe(0.25)
    expect(expressions.parameters.value.get('ParamMouthForm')?.currentValue).toBe(0.5)
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
