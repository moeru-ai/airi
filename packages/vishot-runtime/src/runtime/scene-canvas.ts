export interface ScenarioCanvasScaleOptions {
  viewportWidth: number
  viewportHeight: number
  canvasWidth: number
  canvasHeight: number
  scaleMultiplier?: number
}

/**
 * Computes the single scale factor used to fit a fixed logical scene surface into
 * the current viewport.
 *
 * This mirrors the core idea used by Slidev: keep scene coordinates stable by
 * defining a fixed inner canvas size, then scale that whole surface as one unit
 * instead of positioning content directly in a responsive box.
 *
 * Slidev references:
 * - `slidev/packages/client/internals/SlideContainer.vue`
 * - `slidev/packages/client/internals/SlideWrapper.vue`
 * - `slidev/packages/client/env.ts`
 */
export function computeScenarioCanvasScale(options: ScenarioCanvasScaleOptions): number {
  const { viewportWidth, viewportHeight, canvasWidth, canvasHeight } = options
  const scaleMultiplier = options.scaleMultiplier && options.scaleMultiplier > 0
    ? options.scaleMultiplier
    : 1

  if (viewportWidth <= 0 || viewportHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0)
    return scaleMultiplier

  const fittedScale = Math.min(
    viewportWidth / canvasWidth,
    viewportHeight / canvasHeight,
  )

  return fittedScale * scaleMultiplier
}
