import type { Matrix } from '@pixi/math'
import type { Bounds } from 'pixi-live2d-display/cubism4'

/** A point in the model's own canvas space, before any stage transform. */
export interface Live2DModelCanvasPoint {
  x: number
  y: number
}

/** An axis-aligned box, in whichever space the producer names. */
export interface Live2DModelCanvasRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * What the tracker asks a model for.
 *
 * Narrower than the internal model, which satisfies it structurally: the tracker
 * reads the rig and the drawables and nothing else, and saying so lets it be
 * exercised without a Cubism runtime.
 */
export interface Live2DHeadSource {
  hitAreas: Record<string, { index: number }>
  coreModel: {
    update: () => void
    getDrawableCount: () => number
    getParameterIndex: (id: string) => number
    getParameterValueById: (id: string) => number
    setParameterValueById: (id: string, value: number) => void
    getParameterMaximumValue: (index: number) => number
  }
  getDrawableBounds: (index: number) => Bounds
}

/**
 * Hit-area names that mean "head", lowercased.
 *
 * Author-declared and exact when present, but optional: of the seven models
 * shipped with the Cubism SDK, three declare one.
 */
const headAreaNames = new Set(['head', 'face'])

/**
 * Cubism's standard parameters for turning the head.
 *
 * Part of the published standard parameter list, which is why this project
 * already writes `ParamMouthOpenY` by id. Six of the seven SDK sample models
 * define at least one; the one that does not is a dog, whose head does not turn
 * independently and which therefore has no head to follow.
 */
const headAngleParameterIds = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ']

/**
 * Share of the largest observed movement a drawable must reach to count.
 *
 * Separates drawables the head carries from arithmetic noise in the ones it does
 * not. Relative to the largest mover, so it needs no knowledge of the model's
 * scale or of how far its head turns.
 */
const movedShare = 0.2

function unionInto(target: Bounds, next: Bounds) {
  const right = Math.max(target.x + target.width, next.x + next.width)
  const bottom = Math.max(target.y + target.height, next.y + next.height)
  target.x = Math.min(target.x, next.x)
  target.y = Math.min(target.y, next.y)
  target.width = right - target.x
  target.height = bottom - target.y
}

function measureEvery(internalModel: Live2DHeadSource, count: number) {
  const measured: Bounds[] = []
  for (let index = 0; index < count; index++)
    measured.push({ ...internalModel.getDrawableBounds(index) })

  return measured
}

function travelled(before: Bounds, after: Bounds) {
  return Math.hypot(after.x - before.x, after.y - before.y)
    + Math.hypot(after.width - before.width, after.height - before.height)
}

/**
 * Follows the head of a Live2D model across frames.
 *
 * What counts as the head is decided once, from what the model itself states.
 * A hit area names it outright. Failing that, the rig answers: turning the head
 * moves the drawables the head carries and leaves the rest where they are, which
 * is the same question VRM answers with skinning weights.
 *
 * Nothing is guessed from where a drawable sits. A model that states neither has
 * no head to follow, and the tracker says so rather than picking the topmost
 * drawables and hoping.
 *
 * @example
 * const tracker = createLive2DHeadTracker()
 * tracker.bounds(internalModel)
 * // => { x: 1104, y: 402, width: 768, height: 690 }
 */
export function createLive2DHeadTracker() {
  let tracked: number[] | undefined
  let selected = false

  function selectByHitArea(internalModel: Live2DHeadSource) {
    const headArea = Object.entries(internalModel.hitAreas)
      .find(([name]) => headAreaNames.has(name.toLowerCase()))?.[1]

    return headArea ? [headArea.index] : undefined
  }

  /**
   * Turns the head once and keeps whatever moved.
   *
   * The parameters are put back and the model updated again before returning, so
   * the pose a caller sees is the one it had.
   */
  function selectByHeadAngle(internalModel: Live2DHeadSource) {
    const core = internalModel.coreModel
    const available = headAngleParameterIds
      .map(id => ({ id, index: core.getParameterIndex(id) }))
      .filter(parameter => parameter.index >= 0)

    const count = core.getDrawableCount()
    if (available.length === 0 || count === 0)
      return undefined

    const held = available.map(parameter => core.getParameterValueById(parameter.id))

    core.update()
    const resting = measureEvery(internalModel, count)

    for (const parameter of available)
      core.setParameterValueById(parameter.id, core.getParameterMaximumValue(parameter.index))

    core.update()
    const turned = measureEvery(internalModel, count)

    available.forEach((parameter, at) => core.setParameterValueById(parameter.id, held[at]))
    core.update()

    const movement = resting.map((bounds, index) => travelled(bounds, turned[index]))
    const largest = Math.max(...movement)
    if (largest <= 0)
      return undefined

    const moved = movement
      .map((distance, index) => ({ distance, index }))
      .filter(entry => entry.distance >= largest * movedShare)
      .map(entry => entry.index)

    return moved.length > 0 ? moved : undefined
  }

  return {
    /**
     * The head's box in model canvas space, or `undefined` when the model states
     * no head.
     *
     * A box rather than a point, because a caller placing something beside the
     * character has to know how wide the head is to clear it.
     */
    bounds(internalModel: Live2DHeadSource): Live2DModelCanvasRect | undefined {
      if (!selected) {
        selected = true
        tracked = selectByHitArea(internalModel) ?? selectByHeadAngle(internalModel)
      }

      if (!tracked)
        return undefined

      let union: Bounds | undefined
      for (const index of tracked) {
        const drawable = internalModel.getDrawableBounds(index)
        if (drawable.width <= 0 || drawable.height <= 0)
          continue

        if (!union)
          union = { ...drawable }
        else
          unionInto(union, drawable)
      }

      return union ? { x: union.x, y: union.y, width: union.width, height: union.height } : undefined
    },

    /** Drops the selection so the next model answers for itself. */
    reset() {
      tracked = undefined
      selected = false
    },
  }
}

/**
 * Maps a model canvas point into the space the model's parent draws in.
 *
 * `Live2DModel.toModelPosition` composes the inverse of this pair, applying
 * `worldTransform` then `localTransform` in reverse. Following it forward keeps
 * the bubble in the space the library hit-tests in, including the pivot the
 * model's anchor writes.
 *
 * Source: `toModelPosition` in
 * node_modules/pixi-live2d-display/dist/cubism4.es.js.
 */
export function live2DCanvasPointToParent(
  point: Live2DModelCanvasPoint,
  internalModelLocalTransform: Matrix,
  modelLocalTransform: Matrix,
): Live2DModelCanvasPoint {
  const afterModelLayout = internalModelLocalTransform.apply(point)
  return modelLocalTransform.apply(afterModelLayout)
}

/**
 * Maps a model canvas box into the space the model's parent draws in.
 *
 * Both transforms can flip an axis, so the mapped corners are re-sorted rather
 * than assumed to stay top-left and bottom-right.
 */
export function live2DCanvasRectToParent(
  rect: Live2DModelCanvasRect,
  internalModelLocalTransform: Matrix,
  modelLocalTransform: Matrix,
): Live2DModelCanvasRect {
  const topLeft = live2DCanvasPointToParent(rect, internalModelLocalTransform, modelLocalTransform)
  const bottomRight = live2DCanvasPointToParent(
    { x: rect.x + rect.width, y: rect.y + rect.height },
    internalModelLocalTransform,
    modelLocalTransform,
  )

  const x = Math.min(topLeft.x, bottomRight.x)
  const y = Math.min(topLeft.y, bottomRight.y)

  return {
    x,
    y,
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  }
}
