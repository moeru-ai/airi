<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { useTemplateRef, watch } from 'vue'

import { drawWaveformBars, waveformSlots } from '../../../../libs/voice/waveform'

const props = defineProps<{
  /** The newest microphone level, from 0 to 1. Each new value adds one bar while `active` is true. */
  level: number
  active: boolean
}>()

/** Levels kept for a wide canvas. At the host's 20 Hz level rate, 240 levels are 12 seconds. */
const HISTORY_LIMIT = 240

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width, height } = useElementSize(canvas)
let history: number[] = []

/**
 * Draws the bars on one canvas. The newest level is at the right edge. Slots without a level yet show silence.
 * The waveform sits in a blurred composer. Many DOM bars there repainted the blur on every level, and recording stuttered.
 */
function draw() {
  const element = canvas.value
  if (!element)
    return

  const slots = waveformSlots(width.value)
  const visible = history.slice(-slots)
  const levels = [...Array.from<number>({ length: slots - visible.length }).fill(0), ...visible]
  const color = getComputedStyle(element).color
  drawWaveformBars(element, { width: width.value, height: height.value }, levels, (_, level) => ({ color, alpha: 0.35 + level * 0.65 }))
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
