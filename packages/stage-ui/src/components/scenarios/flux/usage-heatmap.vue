<script setup lang="ts">
import type { DailyUsage, HeatmapCell, HeatmapLevel } from './usage-stats'

import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { buildHeatmap, formatDay, formatFlux } from './usage-stats'

const props = defineProps<{
  /** One item for each day, oldest first. */
  days: readonly DailyUsage[]
}>()

const DOT_SIZE = 12
const DOT_GAP = 3
const DOT_STEP = DOT_SIZE + DOT_GAP
/** Space above the grid for the month labels. */
const MONTH_LABEL_HEIGHT = 20
/** Rows that get a weekday label. Row 0 is Sunday. */
const LABELED_WEEKDAYS = [1, 3, 5]

const levelClasses: Record<HeatmapLevel, string[]> = {
  0: ['bg-neutral-200 dark:bg-neutral-800'],
  1: ['bg-primary-200 dark:bg-primary-900'],
  2: ['bg-primary-300 dark:bg-primary-700'],
  3: ['bg-primary-400 dark:bg-primary-600'],
  4: ['bg-primary-500 dark:bg-primary-400'],
}

const { t, locale } = useI18n()
const scrollElement = ref<HTMLElement>()
const hoveredCell = ref<HeatmapCell | null>(null)

const layout = computed(() => buildHeatmap(props.days))

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

const gridWidth = computed(() => layout.value.weekCount * DOT_STEP - DOT_GAP)
const gridHeight = 7 * DOT_STEP - DOT_GAP

function describeCell(cell: HeatmapCell): string {
  return `${formatDay(cell.date, locale.value)}: ${t('settings.pages.flux.usage.heatmapDay', { flux: formatFlux(cell.microFlux, locale.value) }, cell.newSessionCount)}`
}

// The newest days are on the right, so open the grid scrolled to them.
watch(() => layout.value.weekCount, async () => {
  await nextTick()
  if (scrollElement.value)
    scrollElement.value.scrollLeft = scrollElement.value.scrollWidth
}, { immediate: true, flush: 'post' })
</script>

<template>
  <section :class="['flex flex-col gap-2']">
    <p :class="['min-h-5 text-sm', 'text-neutral-600 dark:text-neutral-300']" aria-live="polite">
      {{ hoveredCell ? describeCell(hoveredCell) : '' }}
    </p>

    <div :class="['flex gap-2']">
      <div
        :class="['relative shrink-0 text-xs', 'text-neutral-500 dark:text-neutral-400']"
        :style="{ width: '1rem', height: `${MONTH_LABEL_HEIGHT + gridHeight}px` }"
        aria-hidden="true"
      >
        <span
          v-for="label in weekdayLabels"
          :key="label.weekday"
          :class="['absolute leading-3']"
          :style="{ top: `${MONTH_LABEL_HEIGHT + label.weekday * DOT_STEP}px` }"
        >
          {{ label.text }}
        </span>
      </div>

      <div ref="scrollElement" :class="['min-w-0 flex-1 overflow-x-auto']">
        <div
          role="img"
          :aria-label="t('settings.pages.flux.usage.heatmapLabel')"
          :class="['relative']"
          :style="{ width: `${gridWidth}px`, height: `${MONTH_LABEL_HEIGHT + gridHeight}px` }"
          @pointerleave="hoveredCell = null"
        >
          <span
            v-for="label in monthLabels"
            :key="label.weekIndex"
            :class="['absolute top-0 text-xs leading-4', 'text-neutral-500 dark:text-neutral-400']"
            :style="{ left: `${label.weekIndex * DOT_STEP}px` }"
          >
            {{ label.text }}
          </span>

          <span
            v-for="cell in layout.cells"
            :key="cell.date"
            :class="[
              'absolute rounded-full transition-transform',
              'hover:scale-125',
              ...levelClasses[cell.level],
            ]"
            :style="{
              left: `${cell.weekIndex * DOT_STEP}px`,
              top: `${MONTH_LABEL_HEIGHT + cell.weekday * DOT_STEP}px`,
              width: `${DOT_SIZE}px`,
              height: `${DOT_SIZE}px`,
            }"
            @pointerenter="hoveredCell = cell"
          />
        </div>
      </div>
    </div>
  </section>
</template>
