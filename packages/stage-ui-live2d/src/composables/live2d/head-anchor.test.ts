import type { Live2DHeadSource } from './head-anchor'

import { describe, expect, it } from 'vitest'

import { createLive2DHeadTracker } from './head-anchor'

interface RiggedModelOptions {
  /** Drawables the head carries, by index. */
  head: number[]
  drawables: number
  /** Standard head-angle parameters the model defines. */
  angleParameters?: string[]
  /** Standard body-angle parameters the model defines. */
  bodyParameters?: string[]
  /** Drawables the body carries, which the head may also nudge. */
  body?: number[]
  /** How far the body nudges a drawable the head carries, as a share. */
  bodyFollow?: number
  /** Drawables that only move once physics has run. */
  physicsDriven?: number[]
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
  const bodyParameters = options.bodyParameters ?? []
  const physicsDriven = options.physicsDriven ?? []
  const values = new Map([...angleParameters, ...bodyParameters].map(id => [id, 0]))
  let head = 0
  let body = 0
  let swung = 0

  const headValue = () => angleParameters.reduce((total, id) => total + (values.get(id) ?? 0), 0)

  return {
    updates: 0,
    hitAreas: options.hitAreas ?? {},
    physics: {
      // Springs carry the head's motion outward a step at a time.
      evaluate: () => void (swung += (headValue() - swung) * 0.5),
    },
    coreModel: {
      update() {
        head = headValue()
        body = bodyParameters.reduce((total, id) => total + (values.get(id) ?? 0), 0)
      },
      getDrawableCount: () => options.drawables,
      getParameterIndex: (id: string) => [...angleParameters, ...bodyParameters].indexOf(id),
      getParameterValueById: (id: string) => values.get(id) ?? 0,
      setParameterValueById: (id: string, value: number) => void values.set(id, value),
      getParameterMaximumValue: () => 30,
      getParameterMinimumValue: () => -30,
    },
    getDrawableBounds: (index: number) => {
      let offset = 0
      if (options.head.includes(index))
        offset += head + body * (options.bodyFollow ?? 0)
      if (options.body?.includes(index))
        offset += body
      if (physicsDriven.includes(index))
        offset += swung

      return { x: offset, y: index * 10, width: 8, height: 8 }
    },
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

  it('keeps what only moves once physics has run', () => {
    // Hair and accessories are often swung by physics rather than by the head
    // parameter itself. A measurement that does not run physics misses them and
    // reports a head narrower than the one on screen.
    const model = riggedModel({ drawables: 4, head: [0], physicsDriven: [2] })

    const bounds = createLive2DHeadTracker().bounds(model)

    expect(bounds?.y).toBe(0)
    expect(bounds?.height).toBe(28)
  })

  it('drops what follows the body as much as the head', () => {
    // A drawable the body carries does not move when only the head turns, so it
    // never reaches the threshold.
    const model = riggedModel({
      drawables: 4,
      head: [0],
      body: [2],
      bodyParameters: ['ParamBodyAngleX'],
    })

    const bounds = createLive2DHeadTracker().bounds(model)

    // The one drawable the head carries, measured back at rest.
    expect(bounds).toEqual({ x: 0, y: 0, width: 8, height: 8 })
  })

  it('finds the head on a model already turned to its limit', () => {
    // ROOT CAUSE:
    //
    // The probe always turned toward the maximum:
    //
    //   core.setParameterValueById(id, core.getParameterMaximumValue(index))
    //
    // A model resting there moved nothing, so no drawable was kept, and the
    // failure was cached until the model was replaced.
    const model = riggedModel({ drawables: 4, head: [1] })
    model.coreModel.setParameterValueById('ParamAngleX', 30)

    expect(createLive2DHeadTracker().bounds(model)).toEqual({ x: 30, y: 10, width: 8, height: 8 })
  })

  it('answers again for a replaced model after a reset', () => {
    const tracker = createLive2DHeadTracker()
    tracker.bounds(riggedModel({ drawables: 3, head: [0] }))

    tracker.reset()

    expect(tracker.bounds(riggedModel({ drawables: 3, head: [], angleParameters: [] }))).toBeUndefined()
  })
})
