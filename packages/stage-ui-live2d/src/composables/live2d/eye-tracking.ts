import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { computed, toValue } from 'vue'

export interface Live2DEyeFocusSource {
  x: number
  y: number
}

export interface Live2DEyeFocusOffset {
  x: number
  y: number
}

/**
 * Maps a cursor position into the Live2D model driver's eye focus coordinates.
 *
 * Use when:
 * - A Live2D scene owns the canvas and fitted model geometry.
 * - A parent component provides cursor coordinates in the same client coordinate space as the canvas rect.
 *
 * Expects:
 * - Source coordinates are relative to the browser viewport or Electron window that contains the canvas.
 * - The canvas element exposes a client rect in that same coordinate space.
 *
 * Returns:
 * - A computed focus point suitable for `Live2DModel.focus(x, y)`.
 */
export function useLive2DEyeFocusFor(options: {
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>
  model: MaybeRefOrGetter<{
    normalizedScale: number
    modelWidth: number
    modelHeight: number
  }>
  source: MaybeRefOrGetter<Live2DEyeFocusSource | null | undefined>
  renderScale: MaybeRefOrGetter<number>
  modelScale: MaybeRefOrGetter<number>
  eyeOffset: MaybeRefOrGetter<Live2DEyeFocusOffset>
}): ComputedRef<{ x: number, y: number }> {
  const mouseFocus = computed(() => {
    const { normalizedScale, modelWidth, modelHeight } = toValue(options.model)
    const renderScale = toValue(options.renderScale)
    const modelScale = toValue(options.modelScale)
    const modelEyeOffset = toValue(options.eyeOffset)
    const trackingSource = toValue(options.source)
    const canvasRect = toValue(options.canvas)?.getBoundingClientRect()
    if (!trackingSource || !(canvasRect)) {
      return { x: 1000, y: 1000 }
    }
    const eyeOffset = {
      x: modelEyeOffset.x / 100 * modelWidth * normalizedScale * modelScale,
      y: modelEyeOffset.y / 100 * modelHeight * normalizedScale * modelScale,
    }
    return {
      x: (trackingSource.x - canvasRect.left + eyeOffset.x) * renderScale,
      y: (trackingSource.y - canvasRect.top + eyeOffset.y) * renderScale,
    }
  })

  return mouseFocus
}
