import type { MaybeRefOrGetter } from 'vue'

import { useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, toValue } from 'vue'

import { useSettingsLive2d } from './live2d'

const mousePosition = useMouse()
const { live2dRenderScale, live2dModelEyeOffset } = storeToRefs(useSettingsLive2d())

export function useLive2DCursorTracking(canvas: MaybeRefOrGetter<HTMLCanvasElement | undefined>, modelScaling: MaybeRefOrGetter<number>) {
  const canvasBoundingRect = computed(() => {
    return toValue(canvas)?.getBoundingClientRect() ?? { top: 0, left: 0, bottom: 0, right: 0, height: 500 }
  })
  const mouseFocus = computed(() => {
    const modelScale: number = toValue(modelScaling)
    const renderScale = live2dRenderScale.value
    return {
      x: (mousePosition.x.value - canvasBoundingRect.value.left + live2dModelEyeOffset.value.x * modelScale) * renderScale,
      y: (mousePosition.y.value - canvasBoundingRect.value.top + live2dModelEyeOffset.value.y * modelScale) * renderScale,
    }
  })

  return mouseFocus
}
