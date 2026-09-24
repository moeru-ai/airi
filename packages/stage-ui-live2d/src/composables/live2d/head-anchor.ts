import type { Matrix } from '@pixi/math'
import type { Bounds } from 'pixi-live2d-display/cubism4'

import type { PixiLive2DInternalModel } from './motion-manager'

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
 * Hit-area names that mean "head", lowercased.
 *
 * Hit areas are authored per model and most models define none for the head, so
 * this is the cheap path rather than the expected one.
 */
const headAreaNames = new Set(['head', 'face'])

/**
 * Share of the model's height, measured from the top, that counts as the head.
 *
 * Cubism canvases are laid out with the character upright and the head at the
 * top, which is what makes a purely geometric search possible on models whose
 * drawables are named in another language.
 */
const headBandRatio = 0.3

/**
 * Largest share of the model's height one head drawable may span.
 *
 * A full-body layer and a long hair strand both start at the top and reach the
 * hem. They move with the body rather than the head, so tracking them would
 * damp the very motion the bubble is supposed to pick up.
 */
const headDrawableMaxHeightRatio = 0.45

/**
 * How many drawables the tracker keeps.
 *
 * Every kept drawable is measured again on each frame the bubble is drawn, so
 * this bounds that cost. The highest drawables are kept, which is where a head
 * sits.
 */
const trackedDrawableLimit = 16

function unionInto(target: Bounds, next: Bounds) {
  const right = Math.max(target.x + target.width, next.x + next.width)
  const bottom = Math.max(target.y + target.height, next.y + next.height)
  target.x = Math.min(target.x, next.x)
  target.y = Math.min(target.y, next.y)
  target.width = right - target.x
  target.height = bottom - target.y
}

function drawableCount(internalModel: PixiLive2DInternalModel) {
  const core = internalModel.coreModel as { getDrawableCount?: () => number }
  return core.getDrawableCount?.() ?? 0
}

/**
 * Follows the top of a Live2D model's head across frames.
 *
 * Chooses what to track once, from geometry, because neither of the cheaper
 * routes is available in general: hit areas are optional and most models define
 * only a body, and drawable ids are authored in the artist's own language, so
 * matching them against English words finds nothing.
 *
 * @example
 * const tracker = createLive2DHeadTracker()
 * tracker.anchor(internalModel)
 * // => { x: 1488, y: 402 }
 */
export function createLive2DHeadTracker() {
  let tracked: number[] | undefined
  let fallback: Live2DModelCanvasRect | undefined

  function selectDrawables(internalModel: PixiLive2DInternalModel) {
    const count = drawableCount(internalModel)
    if (count === 0)
      return []

    const measured: { index: number, bounds: Bounds }[] = []
    let content: Bounds | undefined

    for (let index = 0; index < count; index++) {
      const bounds = internalModel.getDrawableBounds(index)
      if (bounds.width <= 0 || bounds.height <= 0)
        continue

      measured.push({ index, bounds: { ...bounds } })
      if (!content)
        content = { ...bounds }
      else
        unionInto(content, bounds)
    }

    if (!content)
      return []

    fallback = { x: content.x, y: content.y, width: content.width, height: content.height * headBandRatio }

    const bandBottom = content.y + content.height * headBandRatio
    const maxHeight = content.height * headDrawableMaxHeightRatio

    return measured
      .filter(entry => entry.bounds.y < bandBottom && entry.bounds.height < maxHeight)
      .sort((left, right) => left.bounds.y - right.bounds.y)
      .slice(0, trackedDrawableLimit)
      .map(entry => entry.index)
  }

  return {
    /**
     * The head's box in model canvas space, or `undefined` when the model
     * exposes no drawable to measure.
     *
     * A box rather than a point, because a caller placing something beside the
     * character has to know how wide the head is to clear it.
     */
    bounds(internalModel: PixiLive2DInternalModel): Live2DModelCanvasRect | undefined {
      const headArea = Object.entries(internalModel.hitAreas)
        .find(([name]) => headAreaNames.has(name.toLowerCase()))?.[1]

      if (headArea) {
        const area = internalModel.getDrawableBounds(headArea.index)
        return { x: area.x, y: area.y, width: area.width, height: area.height }
      }

      tracked ??= selectDrawables(internalModel)

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

      if (union)
        return { x: union.x, y: union.y, width: union.width, height: union.height }

      return fallback
    },

    /** Drops the selection so the next model chooses its own drawables. */
    reset() {
      tracked = undefined
      fallback = undefined
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
