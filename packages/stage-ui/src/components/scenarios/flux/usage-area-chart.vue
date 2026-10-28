<script setup lang="ts">
import type { SeriesPoint } from 'd3'

import type { DailyUsage } from './usage-stats'
import type { UsageTooltipContent } from './usage-tooltip.vue'

import { useElementSize } from '@vueuse/core'
import { area, curveLinear, line, scaleLinear, stack } from 'd3'
import { clamp } from 'es-toolkit'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageChartFrame from './usage-chart-frame.vue'

import { formatDay, formatFlux, totalMicroFlux } from './usage-stats'

const props = defineProps<{
  /** The days to draw, oldest first. The last day is today. */
  days: readonly DailyUsage[]
}>()

const CHART_HEIGHT = 128
/** Keeps the top edge of the tallest day inside the chart. */
const TOP_PADDING = 8
/** Half of the widest tooltip. Keeps the tooltip inside the chart at both edges. */
const TOOLTIP_HALF_WIDTH = 72

const layerKeys = ['llmMicroFlux', 'ttsMicroFlux'] as const
type LayerKey = typeof layerKeys[number]

const layerStyles: Record<LayerKey, { fill: string, stroke: string, dot: string, labelKey: string }> = {
  llmMicroFlux: { fill: 'fill-primary-500/25', stroke: 'stroke-primary-500', dot: 'bg-primary-500', labelKey: 'settings.pages.flux.usage.layers.llm' },
  ttsMicroFlux: { fill: 'fill-primary-300/60', stroke: 'stroke-primary-300', dot: 'bg-primary-300', labelKey: 'settings.pages.flux.usage.layers.speech' },
}

const { t, locale } = useI18n()
const chartElement = ref<HTMLElement>()
const { width } = useElementSize(chartElement)
const hoveredIndex = ref<number | null>(null)

const maxTotal = computed(() => Math.max(1, ...props.days.map(totalMicroFlux)))
const xScale = computed(() => scaleLinear().domain([0, Math.max(props.days.length - 1, 1)]).range([0, width.value]))
const yScale = computed(() => scaleLinear().domain([0, maxTotal.value]).range([CHART_HEIGHT, TOP_PADDING]))

// The first key is the bottom layer. Speech stacks on top of LLM.
const layers = computed(() => {
  const series = stack<DailyUsage, LayerKey>().keys(layerKeys).value((day, key) => day[key])([...props.days])
  const areaPath = area<SeriesPoint<DailyUsage>>()
    .x((_point, index) => xScale.value(index))
    .y0(point => yScale.value(point[0]))
    .y1(point => yScale.value(point[1]))
    .curve(curveLinear)
  const edgePath = line<SeriesPoint<DailyUsage>>()
    .x((_point, index) => xScale.value(index))
    .y(point => yScale.value(point[1]))
    .curve(curveLinear)

  return series.map(layer => ({
    key: layer.key,
    area: areaPath(layer) ?? '',
    edge: edgePath(layer) ?? '',
  }))
})

const totalFlux = computed(() => formatFlux(props.days.reduce((sum, day) => sum + totalMicroFlux(day), 0), locale.value))

const hoveredDay = computed(() => hoveredIndex.value === null ? undefined : props.days[hoveredIndex.value])
const marker = computed(() => {
  const day = hoveredDay.value
  if (!day || hoveredIndex.value === null)
    return null
  return { x: xScale.value(hoveredIndex.value), y: yScale.value(totalMicroFlux(day)) }
})

const tooltip = computed<UsageTooltipContent | null>(() => {
  const day = hoveredDay.value
  if (!day || marker.value === null)
    return null

  const placeLeft = marker.value.x > width.value - TOOLTIP_HALF_WIDTH * 2
  return {
    left: marker.value.x,
    top: marker.value.y,
    placement: placeLeft ? 'left' : 'right',
    title: formatDay(day.date, locale.value),
    lines: [
      `${t('settings.pages.flux.usage.layers.llm')} ${t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(day.llmMicroFlux, locale.value) })}`,
      `${t('settings.pages.flux.usage.layers.speech')} ${t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(day.ttsMicroFlux, locale.value) })}`,
    ],
  }
})

function handlePointerMove(event: PointerEvent) {
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect()
  const position = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
  hoveredIndex.value = clamp(Math.round(position * (props.days.length - 1)), 0, props.days.length - 1)
}
</script>

<template>
  <UsageChartFrame
    :title="t('settings.pages.flux.usage.areaChart.title')"
    :value="t('settings.pages.flux.usage.fluxAmount', { amount: totalFlux })"
    :start-label="formatDay(days[0]?.date ?? '', locale)"
    :end-label="t('settings.pages.flux.usage.today')"
    :tooltip="tooltip"
  >
    <template #legend>
      <div :class="['flex items-center gap-4 pb-1 text-xs text-neutral-500 dark:text-neutral-400']">
        <span v-for="key in layerKeys" :key="key" :class="['flex items-center gap-1.5']">
          <span :class="['size-2 rounded-full', layerStyles[key].dot]" />
          {{ t(layerStyles[key].labelKey) }}
        </span>
      </div>
    </template>

    <div ref="chartElement" :class="['min-w-0 w-full overflow-hidden']" :style="{ height: `${CHART_HEIGHT}px` }">
      <svg
        v-if="width > 0 && days.length > 1"
        role="img"
        :aria-label="t('settings.pages.flux.usage.areaChart.title')"
        :width="width"
        :height="CHART_HEIGHT"
        :class="['block touch-none']"
        @pointermove="handlePointerMove"
        @pointerleave="hoveredIndex = null"
      >
        <g v-for="layer in layers" :key="layer.key">
          <path :d="layer.area" :class="layerStyles[layer.key].fill" />
          <path
            :d="layer.edge"
            fill="none"
            stroke-width="1.5"
            stroke-linejoin="round"
            :class="layerStyles[layer.key].stroke"
          />
        </g>
        <line
          :x1="0"
          :x2="width"
          :y1="CHART_HEIGHT - 0.5"
          :y2="CHART_HEIGHT - 0.5"
          :class="['stroke-neutral-200 dark:stroke-neutral-800']"
        />
        <circle
          v-if="marker"
          :cx="marker.x"
          :cy="marker.y"
          r="3.5"
          stroke-width="2"
          :class="['fill-primary-500 stroke-white dark:stroke-neutral-900']"
        />
      </svg>
    </div>
  </UsageChartFrame>
</template>
