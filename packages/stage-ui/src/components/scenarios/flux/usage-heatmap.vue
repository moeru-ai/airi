<script setup lang="ts">
import type { DailyUsage, HeatmapCell, HeatmapLevel } from './usage-stats'
import type { UsageTooltipContent } from './usage-tooltip.vue'

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageTooltip, { placeTooltip } from './usage-tooltip.vue'

import { buildHeatmap, daysOfCalendarYear, formatDay, formatFlux } from './usage-stats'

const props = defineProps<{
  /** One item for each day, oldest first. */
  days: readonly DailyUsage[]
}>()

/** Rows that get a weekday label. Row 0 is Sunday. */
const LABELED_WEEKDAYS = [1, 3, 5]
const CELL = 12
const GAP = 2
const LABEL_WIDTH = 16
const MONTH_ROW = 16

const levelClasses: Record<HeatmapLevel, string> = {
  0: 'fill-neutral-200 dark:fill-neutral-800',
  1: 'fill-primary-200 dark:fill-primary-900',
  2: 'fill-primary-300 dark:fill-primary-700',
  3: 'fill-primary-400 dark:fill-primary-600',
  4: 'fill-primary-500 dark:fill-primary-400',
}

const { t, locale } = useI18n()
const containerElement = ref<HTMLElement>()
const tooltip = ref<UsageTooltipContent | null>(null)

// The heat map is the calendar year of the newest day, including later days of that year.
const layout = computed(() => {
  const newest = props.days.at(-1)
  if (!newest)
    return buildHeatmap([])
  return buildHeatmap(daysOfCalendarYear(props.days, Number(newest.date.slice(0, 4))))
})

const monthFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' }))
const weekdayFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { weekday: 'narrow', timeZone: 'UTC' }))
const weekdayLabels = computed(() => LABELED_WEEKDAYS.map(weekday => ({
  weekday,
  // 2024-01-07 is a Sunday.
  text: weekdayFormatter.value.format(new Date(Date.UTC(2024, 0, 7 + weekday))),
})))

const monthLabels = computed(() => layout.value.monthLabels.map(label => ({
  weekIndex: label.weekIndex,
  text: monthFormatter.value.format(new Date(Date.UTC(2024, label.month - 1, 1))),
})))

const frame = computed(() => ({
  width: LABEL_WIDTH + layout.value.weekCount * (CELL + GAP),
  height: MONTH_ROW + 7 * CELL + 6 * GAP,
}))

function columnX(weekIndex: number) {
  return LABEL_WIDTH + GAP + weekIndex * (CELL + GAP)
}

function rowY(weekday: number) {
  return MONTH_ROW + weekday * (CELL + GAP)
}

function place(drawingPixels: number) {
  return `calc(${drawingPixels} * 100cqw / ${frame.value.width})`
}

function showTooltip(cell: HeatmapCell, event: PointerEvent) {
  const container = containerElement.value
  if (!container)
    return
  const cellBounds = (event.currentTarget as SVGCircleElement).getBoundingClientRect()
  const containerBounds = container.getBoundingClientRect()
  const centerY = cellBounds.top + cellBounds.height / 2 - containerBounds.top
  const cellLeft = cellBounds.left - containerBounds.left
  const cellRight = cellBounds.right - containerBounds.left
  tooltip.value = {
    ...placeTooltip(centerY, containerBounds.width, { left: cellLeft, right: cellRight }),
    title: formatDay(cell.date, locale.value),
    lines: [t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(cell.microFlux, locale.value) })],
  }
}
</script>

<template>
  <section ref="containerElement" :class="['relative min-w-0 w-full']" :style="{ containerType: 'inline-size' }">
    <div
      v-if="layout.weekCount > 0"
      role="img"
      :aria-label="t('settings.pages.flux.usage.heatmapLabel')"
      :class="['relative w-full overflow-hidden']"
      :style="{ height: `calc(100cqw * ${frame.height} / ${frame.width})` }"
    >
      <svg
        :width="frame.width"
        :height="frame.height"
        :viewBox="`0 0 ${frame.width} ${frame.height}`"
        :class="['absolute left-0 top-0 origin-top-left']"
        :style="{ transform: `scale(calc(100cqw / ${frame.width}px))` }"
        @pointerleave="tooltip = null"
      >
        <circle
          v-for="cell in layout.cells"
          :key="cell.date"
          :cx="columnX(cell.weekIndex) + CELL / 2"
          :cy="rowY(cell.weekday) + CELL / 2"
          :r="CELL / 2"
          :class="levelClasses[cell.level]"
          @pointerenter="showTooltip(cell, $event)"
        />
      </svg>

      <div aria-hidden="true" :class="['pointer-events-none absolute inset-0 text-xs leading-none text-neutral-500 dark:text-neutral-400']">
        <span
          v-for="label in weekdayLabels"
          :key="label.weekday"
          :class="['absolute left-0 -translate-y-1/2']"
          :style="{ top: place(rowY(label.weekday) + CELL / 2) }"
        >
          {{ label.text }}
        </span>
        <span
          v-for="label in monthLabels"
          :key="label.weekIndex"
          :class="['absolute -translate-y-full whitespace-nowrap']"
          :style="{ left: place(columnX(label.weekIndex)), top: place(MONTH_ROW) }"
        >
          {{ label.text }}
        </span>
      </div>
    </div>

    <UsageTooltip v-if="tooltip" v-bind="tooltip" />
  </section>
</template>
