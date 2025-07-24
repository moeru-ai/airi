<script setup lang="ts">
import { refDebounced, refThrottled, useElementBounding, usePointer, useResizeObserver } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

const minimumDataPoints = 6

interface Point {
  x: number
  y: number
}

const containerRef = ref<HTMLDivElement>()
const canvasContainerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const canvasContext = ref<CanvasRenderingContext2D | undefined | null>()

const { x, y } = usePointer({ target: canvasRef })
const bounding = useElementBounding(canvasContainerRef, { immediate: true, windowResize: true })

const pointComputed = computed(() => {
  return {
    x: x.value,
    y: y.value,
  }
})

useResizeObserver(canvasContainerRef, (entries) => {
  const entry = entries[0]
  const { width, height } = entry.contentRect

  if (!canvasRef.value)
    return

  canvasRef.value.width = width
  canvasRef.value.height = height
})

watch(canvasContainerRef, (el) => {
  if (!el)
    return

  const canvas = document.createElement('canvas')
  canvas.width = bounding.width.value
  canvas.height = bounding.height.value
  canvas.style.objectFit = 'contain'

  const ctx = canvas.getContext('2d')
  canvasContext.value = ctx

  canvasRef.value = canvas
  canvasContainerRef.value?.appendChild(canvas)
})

const pointThrottled = refThrottled(pointComputed, 50)
const pointDebounced = refDebounced(pointComputed, 50)

const lastPoint = ref<Point>(pointDebounced.value)
const distance = ref(0)
const count = ref(0)
const show = ref(false)

const lastPoints = ref<Point[]>([])
const isCircle = ref(false)

watch([x, y], () => {
  if (!canvasContext.value)
    return

  canvasContext.value.beginPath()
  canvasContext.value.fillStyle = 'red'
  // 20: padding left
  // 40: padding top
  // 40: header
  canvasContext.value.arc(x.value - 20, y.value - 40 - 40, 4, 0, 2 * Math.PI)
  canvasContext.value.closePath()
  canvasContext.value.fill()
})

watch(pointDebounced, () => {
  isCircle.value = false
  if (canvasContext.value) {
    canvasContext.value.reset()
  }

  // Use standard deviation of radii to check for circularity to determine if points form a circle
  if (lastPoints.value.length >= minimumDataPoints) {
    // Calculate mean center point
    const meanX = lastPoints.value.reduce((sum, p) => sum + p.x, 0) / lastPoints.value.length
    const meanY = lastPoints.value.reduce((sum, p) => sum + p.y, 0) / lastPoints.value.length

    // Calculate average radius and deviation
    const radii = lastPoints.value.map(p =>
      Math.sqrt((p.x - meanX) ** 2 + (p.y - meanY) ** 2),
    )
    const avgRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length

    // Calculate standard deviation of radii
    const variance = radii.reduce((sum, r) => sum + (r - avgRadius) ** 2, 0) / radii.length
    const stdDev = Math.sqrt(variance)

    // If points roughly form a circle (low standard deviation)
    if (stdDev < 20) {
      count.value++
      isCircle.value = true
    }
  }

  lastPoints.value = []

  // if (lastPoint.value) {
  //   distance.value = Math.sqrt((point.x - lastPoint.value.x) ** 2 + (point.y - lastPoint.value.y) ** 2)

  //   if (distance.value < 20) {
  //     count.value++

  //     if (count.value >= 1) {
  //       count.value = 0
  //       show.value = true
  //     }
  //   }
  // }

  // lastPoint.value = point
})

watch(pointThrottled, (point) => {
  lastPoints.value.push(point)
})
</script>

<template>
  <div ref="containerRef" h="[calc(100dvh-40px)]">
    <div relative h-full>
      <div bg="neutral-100/50 dark:neutral-900/50" absolute inset-0 h-fit rounded-xl px-3 py-2 font-mono shadow-md backdrop-blur-md grid="~ cols-[150px_1fr]">
        <div text="neutral-400 dark:neutral-600">
          pointThrottled:
        </div>
        <div>{{ pointThrottled }}</div>
        <div text="neutral-400 dark:neutral-600">
          pointDebounced:
        </div>
        <div>{{ pointDebounced }}</div>

        <div text="neutral-400 dark:neutral-600">
          lastPoint:
        </div>
        <div>{{ lastPoint }}</div>
        <div text="neutral-400 dark:neutral-600">
          distance:
        </div>
        <div>{{ distance }}</div>
        <div text="neutral-400 dark:neutral-600">
          count:
        </div>
        <div>{{ count }}</div>

        <div text="neutral-400 dark:neutral-600">
          show:
        </div>
        <div>{{ show }}</div>

        <div text="neutral-400 dark:neutral-600">
          lastPoints:
        </div>
        <div>{{ lastPoints }}</div>
        <div text="neutral-400 dark:neutral-600">
          isCircle:
        </div>
        <div>{{ isCircle }}</div>
      </div>

      <div ref="canvasContainerRef" h-full w-full />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
