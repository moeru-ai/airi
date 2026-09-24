import type { Live2DHeadSource } from './head-anchor'

import { describe, expect, it } from 'vitest'

import { createLive2DHeadTracker } from './head-anchor'

interface RiggedModelOptions {
  /** Drawables the head carries, by index. */
  head: number[]
  drawables: number
  /** Standard head-angle parameters the model defines. */
  angleParameters?: string[]
  hitAreas?: Record<string, { index: number }>
}

/**
 * A model that moves the drawables its head carries when the head turns.
 *
 * @example
 * riggedModel({ drawables: 4, head: [1, 2] })
 */
function riggedModel(options: RiggedModelOptions): Live2DHeadSource & { updates: number } {
  const angleParameters = options.angleParameters ?? ['ParamAngleX']
  const values = new Map(angleParameters.map(id => [id, 0]))
  let turned = 0

  return {
    updates: 0,
    hitAreas: options.hitAreas ?? {},
    coreModel: {
      update() {
        turned = values.get(angleParameters[0]) ?? 0
      },
      getDrawableCount: () => options.drawables,
      getParameterIndex: (id: string) => angleParameters.indexOf(id),
      getParameterValueById: (id: string) => values.get(id) ?? 0,
      setParameterValueById: (id: string, value: number) => void values.set(id, value),
      getParameterMaximumValue: () => 30,
    },
    getDrawableBounds: (index: number) => ({
      x: options.head.includes(index) ? turned : 0,
      y: index * 10,
      width: 8,
      height: 8,
    }),
  }
}

describe('live2D head tracker', () => {
  it('keeps the drawables that move when the head turns', () => {
    const model = riggedModel({ drawables: 5, head: [1, 3] })

    const bounds = createLive2DHeadTracker().bounds(model)

    // Only the two that moved, so the box spans their rows and not the others'.
    expect(bounds).toEqual({ x: 0, y: 10, width: 8, height: 28 })
  })

  it('leaves the model in the pose it was given', () => {
    const model = riggedModel({ drawables: 3, head: [0] })
    model.coreModel.setParameterValueById('ParamAngleX', 12)

    createLive2DHeadTracker().bounds(model)

    expect(model.coreModel.getParameterValueById('ParamAngleX')).toBe(12)
  })

  it('takes an author-declared head area without turning anything', () => {
    const model = riggedModel({ drawables: 4, head: [2], hitAreas: { Head: { index: 0 } } })

    const bounds = createLive2DHeadTracker().bounds(model)

    expect(bounds).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('reports no head when the model states none', () => {
    // A model with neither a head area nor a head-angle parameter. Of the seven
    // samples shipped with the Cubism SDK the one in this position is a dog,
    // whose head does not turn on its own, so there is nothing to follow.
    const model = riggedModel({ drawables: 4, head: [], angleParameters: [] })

    expect(createLive2DHeadTracker().bounds(model)).toBeUndefined()
  })

  it('reports no head when the parameter exists but moves nothing', () => {
    const model = riggedModel({ drawables: 4, head: [] })

    expect(createLive2DHeadTracker().bounds(model)).toBeUndefined()
  })

  it('answers again for a replaced model after a reset', () => {
    const tracker = createLive2DHeadTracker()
    tracker.bounds(riggedModel({ drawables: 3, head: [0] }))

    tracker.reset()

    expect(tracker.bounds(riggedModel({ drawables: 3, head: [], angleParameters: [] }))).toBeUndefined()
  })
})
