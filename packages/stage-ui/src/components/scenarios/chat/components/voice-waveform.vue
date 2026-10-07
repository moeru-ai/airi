<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** The newest microphone level, from 0 to 1. Each new value adds one bar while `active` is true. */
  level: number
  active: boolean
  /**
   * Number of bars. At the host's 20 Hz level rate, 40 bars show about 2 seconds.
   * @default 40
   */
  bars?: number
}>(), { bars: 40 })

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width, height } = useElementSize(canvas)
let history: number[] = Array.from<number>({ length: props.bars }).fill(0)

/**
 * Draws the bars on one canvas.
 * The waveform sits in a blurred composer. Many DOM bars there repainted the blur on every level, and recording stuttered.
 */
function draw() {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context || !width.value || !height.value)
    return

  const ratio = window.devicePixelRatio || 1
  element.width = Math.round(width.value * ratio)
  element.height = Math.round(height.value * ratio)
  context.scale(ratio, ratio)
  context.fillStyle = getComputedStyle(element).color

  const gap = 2
  const barWidth = Math.max(2, (width.value - gap * (props.bars - 1)) / props.bars)
  history.forEach((value, index) => {
    // Silence keeps a dot, so the row still reads as a waveform. Level 1 fills the height.
    const barHeight = Math.max(barWidth, value * height.value)
    context.globalAlpha = 0.35 + value * 0.65
    context.beginPath()
    context.roundRect(index * (barWidth + gap), (height.value - barHeight) / 2, barWidth, barHeight, barWidth / 2)
    context.fill()
  })
}

// Each new level adds one bar. The host sends about 20 levels per second, so an identical repeat is rare and only skips one bar.
watch(() => [props.level, props.active] as const, ([level, active]) => {
  if (!active)
    return
  history = [...history.slice(1 - props.bars), level]
  draw()
})

watch(() => props.active, (active) => {
  if (active)
    history = Array.from<number>({ length: props.bars }).fill(0)
  draw()
})

watch([width, height], draw)
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" :class="['h-5 min-w-0 w-full flex-1']" />
</template>
