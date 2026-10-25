<script setup lang="ts">
import type { UsageChartTooltip } from './usage-chart-frame.vue'
import type { DailyUsage } from './usage-stats'

import { useElementSize } from '@vueuse/core'
import { scaleBand, scaleLinear } from 'd3'
import { clamp } from 'es-toolkit'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageChartFrame from './usage-chart-frame.vue'

import { formatDay } from './usage-stats'

const props = defineProps<{
  /** The days to draw, oldest first. The last day is today. */
  days: readonly DailyUsage[]
}>()

const CHART_HEIGHT = 160
/** Keeps the tallest bar inside the chart. */
const TOP_PADDING = 8
/** Half of the widest tooltip. Keeps the tooltip inside the chart at both edges. */
const TOOLTIP_HALF_WIDTH = 72

const { t, locale } = useI18n()
const chartElement = ref<HTMLElement>()
const { width } = useElementSize(chartElement)
const hoveredIndex = ref<number | null>(null)

const maxCount = computed(() => Math.max(1, ...props.days.map(day => day.newSessionCount)))
const xScale = computed(() => scaleBand<number>()
  .domain(props.days.map((_day, index) => index))
  .range([0, width.value])
  .paddingInner(0.25))
const yScale = computed(() => scaleLinear().domain([0, maxCount.value]).range([CHART_HEIGHT, TOP_PADDING]))

// A day without new sessions draws no bar, so the baseline stays visible.
const bars = computed(() => props.days.flatMap((day, index) => day.newSessionCount > 0
  ? [{
      index,
      x: xScale.value(index) ?? 0,
      y: yScale.value(day.newSessionCount),
      height: CHART_HEIGHT - yScale.value(day.newSessionCount),
    }]
  : []))

const totalSessions = computed(() => new Intl.NumberFormat(locale.value).format(props.days.reduce((sum, day) => sum + day.newSessionCount, 0)))

const tooltip = computed<UsageChartTooltip | null>(() => {
  const index = hoveredIndex.value
  const day = index === null ? undefined : props.days[index]
  if (!day || index === null)
    return null

  const center = (xScale.value(index) ?? 0) + xScale.value.bandwidth() / 2
  return {
    left: clamp(center, TOOLTIP_HALF_WIDTH, Math.max(width.value - TOOLTIP_HALF_WIDTH, TOOLTIP_HALF_WIDTH)),
    title: formatDay(day.date, locale.value),
    lines: [t('settings.pages.flux.usage.newSessions', day.newSessionCount)],
  }
})

function handlePointerMove(event: PointerEvent) {
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect()
  const position = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
  hoveredIndex.value = clamp(Math.floor(position * props.days.length), 0, props.days.length - 1)
}
</script>

<template>
  <UsageChartFrame
    :title="t('settings.pages.flux.usage.sessionChart.title')"
    :value="totalSessions"
    :start-label="formatDay(days[0]?.date ?? '', locale)"
    :end-label="t('settings.pages.flux.usage.today')"
    :tooltip="tooltip"
  >
    <div ref="chartElement" :class="['w-full']" :style="{ height: `${CHART_HEIGHT}px` }">
      <svg
        v-if="width > 0 && days.length > 0"
        role="img"
        :aria-label="t('settings.pages.flux.usage.sessionChart.title')"
        :width="width"
        :height="CHART_HEIGHT"
        :class="['block touch-none']"
        @pointermove="handlePointerMove"
        @pointerleave="hoveredIndex = null"
      >
        <rect
          v-for="bar in bars"
          :key="bar.index"
          :x="bar.x"
          :y="bar.y"
          :width="xScale.bandwidth()"
          :height="bar.height"
          rx="2"
          :class="hoveredIndex === bar.index ? 'fill-primary-500' : 'fill-primary-300 dark:fill-primary-400/70'"
        />
        <line
          :x1="0"
          :x2="width"
          :y1="CHART_HEIGHT - 0.5"
          :y2="CHART_HEIGHT - 0.5"
          :class="['stroke-neutral-300 dark:stroke-neutral-700']"
        />
      </svg>
    </div>
  </UsageChartFrame>
</template>
