<script setup lang="ts">
import type { ZoomBehavior, ZoomEvent } from 'd3'

import { axisBottom, scaleLinear, select, zoom } from 'd3'
import { computed, onMounted, onUnmounted, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  durationMs: number
  playheadMs: number
  viewport: readonly [number, number]
  disabled?: boolean
}>()
const emit = defineEmits<{
  scrub: [atMs: number]
  viewport: [viewport: readonly [number, number]]
}>()
const { t } = useI18n()

const ruler = useTemplateRef<SVGSVGElement>('ruler')
const width = 1000
const scale = computed(() => scaleLinear().domain(props.viewport).range([0, width]))
const ticks = computed(() => scale.value.ticks(8).map(value => ({
  value,
  x: scale.value(value),
})))
const playheadX = computed(() => scale.value(props.playheadMs))
let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | undefined

function formatTime(atMs: number) {
  return `${(atMs / 1000).toFixed(atMs >= 10_000 ? 0 : 1)}s`
}

function clientToTime(event: PointerEvent) {
  const bounds = ruler.value!.getBoundingClientRect()
  const x = Math.min(width, Math.max(0, (event.clientX - bounds.left) / bounds.width * width))
  return Math.round(scale.value.invert(x))
}

function scrub(event: PointerEvent) {
  if (props.disabled || event.button !== 0)
    return

  const target = event.currentTarget as SVGSVGElement
  target.setPointerCapture(event.pointerId)
  const update = (nextEvent: PointerEvent) => emit('scrub', clientToTime(nextEvent))
  update(event)
  const stop = () => {
    target.removeEventListener('pointermove', update)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
  }
  target.addEventListener('pointermove', update)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
}

onMounted(() => {
  const baseScale = scaleLinear().domain([0, props.durationMs]).range([0, width])
  zoomBehavior = zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [width, 44]])
    .extent([[0, 0], [width, 44]])
    .filter(event => !props.disabled && (event.type === 'wheel' || event.button === 1 || event.shiftKey))
    .on('zoom', (event: ZoomEvent<SVGSVGElement, unknown>) => {
      const domain = event.transform.rescaleX(baseScale).domain()
      emit('viewport', [Math.max(0, domain[0]), Math.min(props.durationMs, domain[1])])
    })
  select(ruler.value!).call(zoomBehavior)

  // Initialize D3's axis formatter and tick policy. Vue owns the rendered SVG nodes.
  axisBottom(baseScale).ticks(8)
})

onUnmounted(() => {
  if (ruler.value)
    select(ruler.value).on('.zoom', null)
})
</script>

<template>
  <svg
    ref="ruler"
    viewBox="0 0 1000 44"
    preserveAspectRatio="none"
    :class="[
      'h-11 w-full touch-none select-none overflow-visible',
      'cursor-ew-resize bg-neutral-100 dark:bg-neutral-900',
    ]"
    :aria-label="t('tamagotchi.settings.devtools.pages.live2d-motion.editor.timeline-label')"
    @pointerdown="scrub"
  >
    <line x1="0" y1="42" x2="1000" y2="42" :class="['stroke-neutral-300 dark:stroke-neutral-700']" />
    <g v-for="tick in ticks" :key="tick.value">
      <line :x1="tick.x" y1="27" :x2="tick.x" y2="43" :class="['stroke-neutral-300 dark:stroke-neutral-700']" />
      <text :x="tick.x + 4" y="17" :class="['fill-neutral-500 text-[11px] font-mono']">
        {{ formatTime(tick.value) }}
      </text>
    </g>
    <line
      :x1="playheadX"
      y1="0"
      :x2="playheadX"
      y2="44"
      :class="['stroke-amber-500']"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
