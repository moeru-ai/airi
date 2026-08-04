import type { PixiLive2DInternalModel } from './motion-manager'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { useExpressionStore } from '../../stores/expression-store'
import { useExpressionController } from './expression-controller'

describe('useExpressionController', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // ROOT CAUSE:
  //
  // Cubism 2 expression controls were initialized with the model's absolute
  // parameter default. Add and Multiply then treated that value as a blend
  // operand, so a rest value of 1 became `1 + 1` on the first Stage frame.
  // This displaced and rescaled model parts before any expression was enabled.
  //
  // We fixed this by initializing and resetting controls to each blend mode's
  // identity while retaining modelDefault solely as the absolute reset pose.
  it('keeps Cubism 2 blend identities neutral until an expression is enabled', async () => {
    const values = new Map<string, number>([
      ['PARAM_PART_X', 1],
      ['PARAM_PART_SCALE', 0.5],
      ['PARAM_PART_VISIBLE', 1],
    ])
    const getParameterValueById = vi.fn((id: string) => values.get(id) ?? 0)
    const setParameterValueById = vi.fn((id: string, value: number) => values.set(id, value))
    const internalModel = shallowRef({
      coreModel: {
        getParameterDefaultValueById: getParameterValueById,
        getParameterValueById,
        setParameterValueById,
      },
    } as PixiLive2DInternalModel)
    const controller = useExpressionController({ internalModel, modelId: 'cubism2-regression' })

    await controller.initialise([
      { Name: 'parts', File: 'parts.exp.json' },
    ], async () => JSON.stringify({
      params: [
        { id: 'PARAM_PART_X', val: 2, def: 1, calc: 'add' },
        { id: 'PARAM_PART_SCALE', val: 1, def: 0.5, calc: 'mult' },
        { id: 'PARAM_PART_VISIBLE', val: 0, def: 1, calc: 'set' },
      ],
    }))

    const store = useExpressionStore()
    expect(store.expressions.get('PARAM_PART_X')?.currentValue).toBe(0)
    expect(store.expressions.get('PARAM_PART_SCALE')?.currentValue).toBe(1)
    expect(store.expressions.get('PARAM_PART_VISIBLE')?.currentValue).toBe(1)

    controller.applyExpressions(internalModel.value.coreModel)

    expect(setParameterValueById).not.toHaveBeenCalled()

    store.toggle('parts')
    controller.applyExpressions(internalModel.value.coreModel)

    expect(setParameterValueById).toHaveBeenNthCalledWith(1, 'PARAM_PART_X', 2)
    expect(setParameterValueById).toHaveBeenNthCalledWith(2, 'PARAM_PART_SCALE', 1)
    expect(setParameterValueById).toHaveBeenNthCalledWith(3, 'PARAM_PART_VISIBLE', 0)

    setParameterValueById.mockClear()
    store.toggle('parts')
    controller.applyExpressions(internalModel.value.coreModel)

    expect(setParameterValueById).toHaveBeenNthCalledWith(1, 'PARAM_PART_X', 1)
    expect(setParameterValueById).toHaveBeenNthCalledWith(2, 'PARAM_PART_SCALE', 0.5)
    expect(setParameterValueById).toHaveBeenNthCalledWith(3, 'PARAM_PART_VISIBLE', 1)
  })
})
