import type { ComputedRef, MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { computed, toValue } from 'vue'

import { useL2dViewControl } from '../../stores'
import { useSettingsLive2d } from './live2d'

const { live2dRenderScale, live2dModelEyeOffset: live2dModelEyeOffsetPercent, live2dEyeTrackingSource } = storeToRefs(useSettingsLive2d())
const { scale } = useL2dViewControl()

/**
 *
 * @param canvas the canvas that draws the avatar
 * @param model normalized scale and dimensions of the model
 * @returns a computed ref that maps the tracking source's position into the model's rendering space
 */
export function useLive2DEyeTracking(
  canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>,
  model: MaybeRefOrGetter<{
    normalizedScale: number
    modelWidth: number
    modelHeight: number
  }>,
): ComputedRef<{ x: number, y: number }> {
  // computed caching
  const canvasRect = computed(() => {
    return toValue(canvas)?.getBoundingClientRect()
  })
  const mouseFocus = computed(() => {
    const { normalizedScale, modelWidth, modelHeight } = toValue(model)
    const renderScale = live2dRenderScale.value
    // does not require further unwrapping for some reason
    const trackingSource = live2dEyeTrackingSource.value as { x: number, y: number } | null
    if (!trackingSource || !(canvasRect.value)) {
      return { x: 1000, y: 1000 }
    }
    const eyeOffset = {
      x: live2dModelEyeOffsetPercent.value.x / 100 * modelWidth * normalizedScale * scale.value,
      y: live2dModelEyeOffsetPercent.value.y / 100 * modelHeight * normalizedScale * scale.value,
    }
    return {
      x: (trackingSource.x - canvasRect.value.left + eyeOffset.x) * renderScale,
      y: (trackingSource.y - canvasRect.value.top + eyeOffset.y) * renderScale,
    }
  })

  return mouseFocus
}
