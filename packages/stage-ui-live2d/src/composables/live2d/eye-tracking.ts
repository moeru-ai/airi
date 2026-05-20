import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { computed, toValue } from 'vue'

import { useSettingsLive2d } from './live2d'

const { live2dRenderScale, live2dModelEyeOffset, live2dEyeTrackingSource } = storeToRefs(useSettingsLive2d())

/**
 *
 * @param canvas the canvas that draws the avatar
 * @param modelScaling final scaling(resize) of the model, including scaling introduced by normalization and user settings, but not render scale.
 * @returns a computed ref that maps the tracking source's position into the model's rendering space
 */
export function useLive2DCursorTracking(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  modelScaling: MaybeRefOrGetter<number>,
): ComputedRef<{ x: number, y: number }> {
  // computed caching
  const canvasRect = computed(() => {
    return toValue(canvas)?.getBoundingClientRect()
  })
  const mouseFocus = computed(() => {
    const modelScale: number = toValue(modelScaling)
    const renderScale = live2dRenderScale.value
    // does not require further unwrapping for some reason
    const trackingSource = live2dEyeTrackingSource.value as { x: number, y: number } | null
    if (!trackingSource || !(canvasRect.value)) {
      return { x: 1000, y: 1000 }
    }
    const eyeOffset = {
      x: live2dModelEyeOffset.value.x * modelScale,
      y: live2dModelEyeOffset.value.y * modelScale,
    }
    return {
      x: (trackingSource.x - canvasRect.value.left + eyeOffset.x) * renderScale,
      y: (trackingSource.y - canvasRect.value.top + eyeOffset.y) * renderScale,
    }
  })

  return mouseFocus
}
