<script setup lang="ts">
import type { SeriesPoint } from 'd3'

import type { UsageChartTooltip } from './usage-chart-frame.vue'
import type { DailyUsage } from './usage-stats'

import { useElementSize } from '@vueuse/core'
import { area, curveMonotoneX, line, scaleLinear, stack } from 'd3'
import { clamp } from 'es-toolkit'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageChartFrame from './usage-chart-frame.vue'

import { formatDay, formatFlux, totalMicroFlux } from './usage-stats'

const props = defineProps<{
  /** The days to draw, oldest first. The last day is today. */
  days: readonly DailyUsage[]
}>()

const CHART_HEIGHT = 160
/** Keeps the top edge of the tallest day inside the chart. */
const TOP_PADDING = 8
/** Half of the widest tooltip. Keeps the tooltip inside the chart at both edges. */
const TOOLTIP_HALF_WIDTH = 72

const layerKeys = ['llmMicroFlux', 'ttsMicroFlux'] as const
type LayerKey = typeof layerKeys[number]

const { t, locale } = useI18n()
const chartElement = ref<HTMLElement>()
const { width } = useElementSize(chartElement)
const hoveredIndex = ref<number | null>(null)

const maxTotal = computed(() => Math.max(1, ...props.days.map(totalMicroFlux)))
const xScale = computed(() => scaleLinear().domain([0, Math.max(props.days.length - 1, 1)]).range([0, width.value]))
const yScale = computed(() => scaleLinear().domain([0, maxTotal.value]).range([CHART_HEIGHT, TOP_PADDING]))

// The first key is the bottom layer. LLM sits at the bottom and speech stacks on top of it.
const layers = computed(() => {
  const series = stack<DailyUsage, LayerKey>().keys(layerKeys).value((day, key) => day[key])(props.days as DailyUsage[])
  const areaPath = area<SeriesPoint<DailyUsage>>()
    .x((_point, index) => xScale.value(index))
    .y0(point => yScale.value(point[0]))
    .y1(point => yScale.value(point[1]))
    .curve(curveMonotoneX)
  const edgePath = line<SeriesPoint<DailyUsage>>()
    .x((_point, index) => xScale.value(index))
    .y(point => yScale.value(point[1]))
    .curve(curveMonotoneX)

  return series.map(layer => ({
    key: layer.key,
    area: areaPath(layer) ?? '',
    edge: edgePath(layer) ?? '',
  }))
})

const totalFlux = computed(() => formatFlux(props.days.reduce((sum, day) => sum + totalMicroFlux(day), 0), locale.value))

const hoveredDay = computed(() => hoveredIndex.value === null ? undefined : props.days[hoveredIndex.value])
const tooltip = computed<UsageChartTooltip | null>(() => {
  const day = hoveredDay.value
  if (!day || hoveredIndex.value === null)
    return null

  return {
    left: clamp(xScale.value(hoveredIndex.value), TOOLTIP_HALF_WIDTH, Math.max(width.value - TOOLTIP_HALF_WIDTH, TOOLTIP_HALF_WIDTH)),
    title: formatDay(day.date, locale.value),
    lines: [
      `${t('settings.pages.flux.usage.layers.llm')}: ${t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(day.llmMicroFlux, locale.value) })}`,
      `${t('settings.pages.flux.usage.layers.speech')}: ${t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(day.ttsMicroFlux, locale.value) })}`,
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
      <div :class="['flex items-center gap-3 text-xs', 'text-neutral-500 dark:text-neutral-400']">
        <span :class="['flex items-center gap-1.5']">
          <span :class="['size-2 rounded-full', 'bg-primary-500']" />
          {{ t('settings.pages.flux.usage.layers.llm') }}
        </span>
        <span :class="['flex items-center gap-1.5']">
          <span :class="['size-2 rounded-full', 'bg-complementary-500']" />
          {{ t('settings.pages.flux.usage.layers.speech') }}
        </span>
      </div>
    </template>

    <div ref="chartElement" :class="['w-full']" :style="{ height: `${CHART_HEIGHT}px` }">
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
          <path
            :d="layer.area"
            :class="layer.key === 'llmMicroFlux' ? 'fill-primary-500/25' : 'fill-complementary-500/25'"
          />
          <path
            :d="layer.edge"
            fill="none"
            stroke-width="1.5"
            stroke-linejoin="round"
            :class="layer.key === 'llmMicroFlux' ? 'stroke-primary-500' : 'stroke-complementary-500'"
          />
        </g>
        <line
          :x1="0"
          :x2="width"
          :y1="CHART_HEIGHT - 0.5"
          :y2="CHART_HEIGHT - 0.5"
          :class="['stroke-neutral-300 dark:stroke-neutral-700']"
        />
        <line
          v-if="hoveredIndex !== null"
          :x1="xScale(hoveredIndex)"
          :x2="xScale(hoveredIndex)"
          :y1="0"
          :y2="CHART_HEIGHT"
          stroke-dasharray="3 3"
          :class="['stroke-neutral-400 dark:stroke-neutral-500']"
        />
      </svg>
    </div>
  </UsageChartFrame>
</template>
