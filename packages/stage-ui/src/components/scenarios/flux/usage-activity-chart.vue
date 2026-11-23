<script setup lang="ts">
import type { ActivityView, DailyUsage } from './usage-stats'

import { GhostButton } from '@proj-airi/ui'
import { onKeyStroke, useElementBounding, usePreferredReducedMotion } from '@vueuse/core'
import { stagger, waapi } from 'animejs'
import { intlFormat, parseISO } from 'date-fns'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { buildActivity, formatFlux } from './usage-stats'

const props = defineProps<{ days: readonly DailyUsage[] }>()
const { t, locale } = useI18n()
const chartId = useId()
const view = shallowRef<ActivityView>('daily')
const activeIndex = shallowRef<number | null>(null)
const keyboardNavigation = shallowRef(false)
const container = useTemplateRef<HTMLElement>('container')
const scroller = useTemplateRef<HTMLElement>('scroller')
const grid = useTemplateRef<HTMLElement>('grid')
const tooltip = useTemplateRef<HTMLElement>('tooltip')
const reducedMotion = usePreferredReducedMotion()
let animation: ReturnType<typeof waapi.animate> | undefined

const views: ActivityView[] = ['daily', 'weekly', 'cumulative']
const viewLabels = computed<Record<ActivityView, { option: string, chart: string }>>(() => ({
  daily: { option: t('settings.pages.flux.usage.views.daily'), chart: t('settings.pages.flux.usage.labels.daily') },
  weekly: { option: t('settings.pages.flux.usage.views.weekly'), chart: t('settings.pages.flux.usage.labels.weekly') },
  cumulative: { option: t('settings.pages.flux.usage.views.cumulative'), chart: t('settings.pages.flux.usage.labels.cumulative') },
}))
const levelClasses = [
  'fill-neutral-100 dark:fill-neutral-800',
  'fill-primary-200 dark:fill-primary-900',
  'fill-primary-300 dark:fill-primary-700',
  'fill-primary-400 dark:fill-primary-600',
  'fill-primary-500 dark:fill-primary-400',
]
const layout = computed(() => buildActivity(props.days, view.value))
const columns = computed(() => `repeat(${Math.max(layout.value.weekCount, 1)}, minmax(0, 1fr))`)
const monthLabels = computed(() => layout.value.monthLabels.map(label => ({
  ...label,
  text: intlFormat(parseISO(label.date), { month: 'short' }, { locale: locale.value }),
})))
const groupLabels = computed(() => {
  function formatDate(date: string) {
    return intlFormat(parseISO(date), { month: 'short', day: 'numeric', year: 'numeric' }, { locale: locale.value })
  }
  return layout.value.groups.map((group) => {
    if (view.value === 'cumulative')
      return t('settings.pages.flux.usage.throughDate', { date: formatDate(group.endDate) })
    if (view.value === 'weekly')
      return `${formatDate(group.date)} – ${formatDate(group.endDate)}`
    return formatDate(group.date)
  })
})
const activeGroup = computed(() => activeIndex.value === null ? undefined : layout.value.groups[activeIndex.value])
const activeElement = computed(() => {
  const element = activeIndex.value === null ? null : grid.value?.children.item(activeIndex.value)
  return element instanceof HTMLElement ? element : null
})
const { left: chartLeft, top: chartTop, width: chartWidth } = useElementBounding(container)
const { left: anchorLeft, top: anchorTop, width: anchorWidth } = useElementBounding(activeElement)
const { width: tooltipWidth } = useElementBounding(tooltip)
const tooltipPosition = computed(() => {
  const center = anchorLeft.value - chartLeft.value + anchorWidth.value / 2
  const halfWidth = tooltipWidth.value / 2
  return {
    left: `${Math.max(halfWidth, Math.min(chartWidth.value - halfWidth, center))}px`,
    top: `${anchorTop.value - chartTop.value - 8}px`,
  }
})

function selectGroup(index: number, keyboard = false) {
  if (!layout.value.groups[index])
    return
  keyboardNavigation.value = keyboard
  activeIndex.value = index
  if (keyboard)
    activeElement.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function focusChart(event: FocusEvent) {
  if (activeIndex.value === null && event.currentTarget instanceof HTMLElement && event.currentTarget.matches(':focus-visible'))
    selectGroup(layout.value.groups.length - 1, true)
}

function clearPointerSelection() {
  if (!keyboardNavigation.value)
    activeIndex.value = null
}

const arrowKeyOffsets = new Map([
  ['ArrowLeft', { columns: -1, rows: 0 }],
  ['ArrowRight', { columns: 1, rows: 0 }],
  ['ArrowUp', { columns: 0, rows: -1 }],
  ['ArrowDown', { columns: 0, rows: 1 }],
])

onKeyStroke([...arrowKeyOffsets.keys(), 'Home', 'End', 'Escape'], (event) => {
  const offset = arrowKeyOffsets.get(event.key)
  if (offset?.rows && view.value !== 'daily')
    return

  event.preventDefault()
  if (event.key === 'Escape') {
    activeIndex.value = null
    return
  }

  const { groups } = layout.value
  const last = groups.length - 1
  if (!offset) {
    selectGroup(event.key === 'Home' ? 0 : last, true)
    return
  }

  const currentIndex = activeIndex.value ?? last
  const currentGroup = groups[currentIndex]
  if (!currentGroup)
    return

  const nextColumn = currentGroup.column + offset.columns
  const nextRow = currentGroup.row + offset.rows
  const nextIndex = groups.findIndex(group => group.column === nextColumn && group.row === nextRow)
  selectGroup(nextIndex === -1 ? currentIndex : nextIndex, true)
}, { target: grid })

async function selectView(nextView: ActivityView) {
  if (view.value === nextView)
    return

  view.value = nextView
  activeIndex.value = null
  await nextTick()
  if (view.value !== nextView)
    return

  animation?.revert()
  const cells = grid.value?.querySelectorAll(':scope > [role="option"]')
  if (!cells?.length || reducedMotion.value === 'reduce')
    return

  animation = waapi.animate(cells, {
    opacity: [0, 1],
    duration: 180,
    delay: stagger([0, 520], { grid: true, axis: 'x' }),
  })
}

watch(() => props.days, () => {
  activeIndex.value = null
})
onBeforeUnmount(() => animation?.revert())
onMounted(() => {
  if (scroller.value)
    scroller.value.scrollLeft = scroller.value.scrollWidth
})
</script>

<template>
  <section ref="container" :class="['relative flex min-w-0 flex-col gap-4']">
    <header :class="['flex flex-wrap items-center justify-between gap-2']">
      <h3 :class="['text-lg font-semibold']">
        {{ t('settings.pages.flux.usage.title') }}
      </h3>
      <div role="group" :aria-label="t('settings.pages.flux.usage.viewLabel')" :class="['flex items-center gap-1']">
        <GhostButton
          v-for="option in views" :key="option"
          size="md"
          :active="view === option"
          :aria-pressed="view === option"
          :aria-controls="chartId"
          :class="['min-h-9']"
          @click="selectView(option)"
        >
          {{ viewLabels[option].option }}
        </GhostButton>
      </div>
    </header>

    <div ref="scroller" :class="['overflow-x-auto pb-1']" @scroll="clearPointerSelection">
      <div :class="['min-w-160']" role="group" :aria-label="t('settings.pages.flux.usage.chartLabel')">
        <div
          :id="chartId"
          ref="grid"
          role="listbox"
          tabindex="0"
          :aria-label="viewLabels[view].chart"
          :aria-describedby="`${chartId}-hint`"
          :aria-activedescendant="activeGroup ? `${chartId}-${activeGroup.date}` : undefined"
          :class="[
            'grid grid-rows-7 rounded-sm',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset--2',
          ]"
          :style="{ gridTemplateColumns: columns, aspectRatio: layout.weekCount ? `${layout.weekCount} / 7` : undefined }"
          @focus="focusChart"
          @blur="activeIndex = null"
          @pointerleave="clearPointerSelection"
        >
          <div
            v-for="(group, index) in layout.groups"
            :id="`${chartId}-${group.date}`"
            :key="group.date"
            role="option"
            :aria-label="groupLabels[index]"
            :aria-selected="activeIndex === index"
            :class="['min-h-0 min-w-0']"
            :style="{ gridColumnStart: group.column + 1, gridRow: view === 'daily' ? group.row + 1 : '1 / -1' }"
            @pointerenter="selectGroup(index)"
            @pointerleave="clearPointerSelection"
            @click="selectGroup(index)"
          >
            <svg
              aria-hidden="true"
              :class="['pointer-events-none block size-full overflow-visible']"
              :viewBox="`0 0 100 ${group.levels.length * 100}`"
            >
              <rect
                v-if="activeIndex === index"
                width="100%"
                height="100%"
                rx="31.6"
                :class="['fill-neutral-950/8 dark:fill-white/10']"
              />
              <rect
                v-for="(level, row) in group.levels"
                :key="row"
                x="10"
                :y="row * 100 + 10"
                width="80"
                height="80"
                rx="21.6"
                :class="levelClasses[level]"
              />
            </svg>
          </div>
        </div>
        <div
          aria-hidden="true"
          :class="['grid mt-3 h-4 text-xs text-neutral-400 dark:text-neutral-500']"
          :style="{ gridTemplateColumns: columns }"
        >
          <span
            v-for="label in monthLabels" :key="label.date"
            :class="['whitespace-nowrap']"
            :style="{ gridColumnStart: label.column + 1 }"
          >{{ label.text }}</span>
        </div>
      </div>
    </div>
    <p :id="`${chartId}-hint`" :class="['sr-only']">
      {{ t('settings.pages.flux.usage.keyboardHint') }}
    </p>

    <div
      v-if="activeGroup && activeIndex !== null"
      ref="tooltip"
      role="status"
      :class="[
        'pointer-events-none absolute z-1 w-max max-w-[min(12.5rem,100%)] -translate-x-1/2 -translate-y-full',
        'rounded-xl px-3 py-2 text-xs shadow-lg',
        'bg-neutral-950 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-950',
      ]"
      :style="tooltipPosition"
    >
      <p :class="['font-medium']">
        {{ groupLabels[activeIndex] }}
      </p>
      <p :class="['tabular-nums opacity-80']">
        {{ t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(activeGroup.microFlux, locale) }) }}
      </p>
    </div>
  </section>
</template>
