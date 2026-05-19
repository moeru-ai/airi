import type { MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { computed, toValue } from 'vue'

import { useSettingsLive2d } from './live2d'

const { live2dRenderScale, live2dModelEyeOffset, live2dEyeTrackingSource } = storeToRefs(useSettingsLive2d())

export function useLive2DCursorTracking(canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>, modelScaling: MaybeRefOrGetter<number>) {
  const canvasBoundingRect = computed(() => {
    return toValue(canvas)?.getBoundingClientRect()
  })
  const mouseFocus = computed(() => {
    const modelScale: number = toValue(modelScaling)
    const renderScale = live2dRenderScale.value
    const trackingSource = live2dEyeTrackingSource.value as { x: number, y: number } | null
    if (!trackingSource || !(canvasBoundingRect.value)) {
      return { x: 1000, y: 1000 }
    }
    return {
      x: (trackingSource.x - canvasBoundingRect.value.left + live2dModelEyeOffset.value.x * modelScale) * renderScale,
      y: (trackingSource.y - canvasBoundingRect.value.top + live2dModelEyeOffset.value.y * modelScale) * renderScale,
    }
  })

  return mouseFocus
}
