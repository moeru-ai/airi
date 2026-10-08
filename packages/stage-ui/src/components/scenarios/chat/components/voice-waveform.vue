<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'

const props = defineProps<{
  /** The newest microphone level, from 0 to 1. Each new value adds one bar while `active` is true. */
  level: number
  active: boolean
}>()

/** Bars keep this width and gap at any canvas width. A wider canvas shows more history, not wider bars. */
const BAR_WIDTH = 3
const BAR_GAP = 2
/** Levels kept for a wide canvas. At the host's 20 Hz level rate, 240 levels are 12 seconds. */
const HISTORY_LIMIT = 240

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width, height } = useElementSize(canvas)
let history: number[] = []

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

  // The newest level is at the right edge. Slots without a level yet show silence.
  const slots = Math.floor((width.value + BAR_GAP) / (BAR_WIDTH + BAR_GAP))
  const visible = history.slice(-slots)
  const offset = slots - visible.length
  for (let slot = 0; slot < slots; slot++) {
    const value = slot < offset ? 0 : visible[slot - offset]
    // Silence keeps a dot, so the row still reads as a waveform. Level 1 fills the height.
    const barHeight = Math.max(BAR_WIDTH, value * height.value)
    context.globalAlpha = 0.35 + value * 0.65
    context.beginPath()
    context.roundRect(slot * (BAR_WIDTH + BAR_GAP), (height.value - barHeight) / 2, BAR_WIDTH, barHeight, BAR_WIDTH / 2)
    context.fill()
  }
}

// Each new level adds one bar. The host sends about 20 levels per second, so an identical repeat is rare and only skips one bar.
watch(() => [props.level, props.active] as const, ([level, active]) => {
  if (!active)
    return
  history = [...history.slice(1 - HISTORY_LIMIT), level]
  draw()
})

watch(() => props.active, (active) => {
  if (active)
    history = []
  draw()
})

watch([width, height], draw)
</script>

<template>
  <canvas ref="canvas" aria-hidden="true" :class="['h-5 min-w-0 w-full flex-1']" />
</template>
