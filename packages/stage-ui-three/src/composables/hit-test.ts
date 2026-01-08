import type { MaybeRefOrGetter, Ref } from 'vue'

import type { RenderTargetRegionRead } from './render-target'

import { toRef } from '@vueuse/core'
import { computed } from 'vue'

interface HitTestTarget {
  readRenderTargetRegionAtClientPoint?: (clientX: number, clientY: number, radius: number) => RenderTargetRegionRead | null
}

export function useThreeSceneIsTransparentAtPoint(
  scene: MaybeRefOrGetter<HitTestTarget | undefined>,
  pointX: MaybeRefOrGetter<number>,
  pointY: MaybeRefOrGetter<number>,
  optionsOrThreshold: number | { threshold?: number, regionRadius?: number } = 10,
): Ref<boolean> {
  const sceneRef = toRef(scene)
  const xRef = toRef(pointX)
  const yRef = toRef(pointY)

  const options = typeof optionsOrThreshold === 'number'
    ? { threshold: optionsOrThreshold, regionRadius: 0 }
    : optionsOrThreshold

  const threshold = options?.threshold ?? 10
  const radius = Math.max(0, options?.regionRadius ?? 0)

  return computed(() => {
    const instance = sceneRef.value
    if (!instance || !instance.readRenderTargetRegionAtClientPoint)
      return true

    const result = instance.readRenderTargetRegionAtClientPoint(xRef.value, yRef.value, radius)
    if (!result)
      return true

    const {
      data,
      readWidth,
      readHeight,
      startX,
      startY,
      centerX,
      centerY,
      scaleX,
      scaleY,
    } = result

    const radiusSq = radius * radius
    for (let y = 0; y < readHeight; y += 1) {
      const gy = startY + y
      const dy = (gy - centerY) / scaleY
      const dySq = dy * dy

      for (let x = 0; x < readWidth; x += 1) {
        const gx = startX + x
        const dx = (gx - centerX) / scaleX
        if (dx * dx + dySq > radiusSq)
          continue

        const index = (y * readWidth + x) * 4
        const alpha = data[index + 3]
        if (alpha >= threshold)
          return false
      }
    }

    return true
  })
}
