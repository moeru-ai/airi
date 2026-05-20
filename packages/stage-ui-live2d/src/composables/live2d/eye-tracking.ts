import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { computed, toValue } from 'vue'

import { useL2dViewControl } from '../../stores'
import { useSettingsLive2d } from './live2d'

export interface Live2DEyeFocusSource {
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
}): ComputedRef<{ x: number, y: number }> {
  const { live2dRenderScale, live2dModelEyeOffset } = storeToRefs(useSettingsLive2d())
  const { scale } = useL2dViewControl()

  const mouseFocus = computed(() => {
    const { normalizedScale, modelWidth, modelHeight } = toValue(options.model)
    const renderScale = live2dRenderScale.value
    const trackingSource = toValue(options.source)
    const canvasRect = toValue(options.canvas)?.getBoundingClientRect()
    if (!trackingSource || !(canvasRect)) {
      return { x: 1000, y: 1000 }
    }
    const eyeOffset = {
      x: live2dModelEyeOffset.value.x / 100 * modelWidth * normalizedScale * scale.value,
      y: live2dModelEyeOffset.value.y / 100 * modelHeight * normalizedScale * scale.value,
    }
    return {
      x: (trackingSource.x - canvasRect.left + eyeOffset.x) * renderScale,
      y: (trackingSource.y - canvasRect.top + eyeOffset.y) * renderScale,
    }
  })

  return mouseFocus
}
