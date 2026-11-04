<script setup lang="ts">
import type { DailyUsage } from '@proj-airi/api-server/types/flux-usage'

import type { ActivityGroup, ActivityView } from './usage-stats'

import { GhostButton } from '@proj-airi/ui'
import { computed, nextTick, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { buildActivity, formatDay, formatFlux } from './usage-stats'

const props = defineProps<{ days: readonly DailyUsage[] }>()
const { t, locale } = useI18n()
const chartId = useId()
const view = shallowRef<ActivityView>('daily')
const activeIndex = shallowRef<number | null>(null)
const keyboardNavigation = shallowRef(false)
const container = useTemplateRef<HTMLElement>('container')
const scroller = useTemplateRef<HTMLElement>('scroller')
const drawing = useTemplateRef<SVGSVGElement>('drawing')
const tooltipPosition = shallowRef({ left: 0, top: 0 })

const views: ActivityView[] = ['daily', 'weekly', 'cumulative']
const levelClasses = [
  'fill-neutral-100 dark:fill-neutral-800',
  'fill-primary-200 dark:fill-primary-900',
  'fill-primary-300 dark:fill-primary-700',
  'fill-primary-400 dark:fill-primary-600',
  'fill-primary-500 dark:fill-primary-400',
]
const layout = computed(() => buildActivity(props.days, view.value))
const drawingWidth = computed(() => layout.value.weekCount * 14)
const monthFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' }))
const monthLabels = computed(() => layout.value.monthLabels.map(label => ({
  column: label.column,
  text: monthFormatter.value.format(new Date(`${label.date}T00:00:00Z`)),
})))
const activeGroup = computed(() => activeIndex.value === null ? undefined : layout.value.groups[activeIndex.value])
const tooltipTitle = computed(() => {
  const group = activeGroup.value
  if (!group)
    return ''
  if (view.value === 'cumulative')
    return t('settings.pages.flux.usage.throughDate', { date: formatDay(group.endDate, locale.value) })
  if (view.value === 'weekly')
    return `${formatDay(group.date, locale.value)} – ${formatDay(group.endDate, locale.value)}`
  return formatDay(group.date, locale.value)
})

function positionTooltip(group: ActivityGroup) {
  const bounds = container.value?.getBoundingClientRect()
  const svgBounds = drawing.value?.getBoundingClientRect()
  if (!bounds || !svgBounds)
    return
  const scale = svgBounds.width / drawingWidth.value
  const anchorX = svgBounds.left - bounds.left + (group.column * 14 + 6) * scale
  const anchorY = svgBounds.top - bounds.top + (view.value === 'daily' ? group.row * 14 : 0) * scale
  tooltipPosition.value = {
    left: Math.max(100, Math.min(bounds.width - 100, anchorX)),
    top: anchorY - 8,
  }
}

function selectGroup(index: number, keyboard = false) {
  const group = layout.value.groups[index]
  if (!group)
    return
  activeIndex.value = index
  keyboardNavigation.value = keyboard
  positionTooltip(group)
}

function scrollChart() {
  if (keyboardNavigation.value && activeGroup.value)
    positionTooltip(activeGroup.value)
  else
    activeIndex.value = null
}

async function navigate(event: KeyboardEvent) {
  const last = layout.value.groups.length - 1
  const current = activeIndex.value ?? last
  let next: number
  switch (event.key) {
    case 'ArrowLeft':
      next = Math.max(0, current - 1)
      break
    case 'ArrowRight':
      next = Math.min(last, current + 1)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    case 'Escape':
      activeIndex.value = null
      event.preventDefault()
      return
    default:
      return
  }
  event.preventDefault()
  const group = layout.value.groups[next]
  const track = scroller.value
  if (group && track) {
    const left = group.column / layout.value.weekCount * track.scrollWidth
    if (left < track.scrollLeft || left + 14 > track.scrollLeft + track.clientWidth)
      track.scrollLeft = left - track.clientWidth / 2
  }
  await nextTick()
  selectGroup(next, true)
}

// View changes discard the old hover target because daily and weekly indices differ.
watch([view, () => props.days], () => {
  activeIndex.value = null
})
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
          @click="view = option"
        >
          {{ t(`settings.pages.flux.usage.views.${option}`) }}
        </GhostButton>
      </div>
    </header>

    <div ref="scroller" :class="['overflow-x-auto pb-1']" @scroll="scrollChart">
      <div
        :id="chartId"
        role="group"
        tabindex="0"
        :aria-label="t('settings.pages.flux.usage.chartLabel')"
        :aria-describedby="`${chartId}-hint`"
        :class="['min-w-160 rounded-sm', 'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset--2']"
        @keydown="navigate"
        @focus="selectGroup(layout.groups.length - 1, true)"
        @blur="activeIndex = null"
        @pointerleave="activeIndex = null"
      >
        <svg
          ref="drawing"
          role="img"
          :aria-label="t(`settings.pages.flux.usage.labels.${view}`)"
          :viewBox="`0 0 ${drawingWidth} 98`"
          :class="['block w-full overflow-visible']"
        >
          <rect
            v-for="cell in layout.cells" :key="cell.id"
            width="11" height="11" rx="3"
            :class="['activity-tile', levelClasses[cell.level]]"
            :style="{
              transform: `translate(${cell.column * 14}px, ${cell.row * 14}px)`,
              opacity: cell.visible ? 1 : 0,
              transitionDelay: `${cell.column * 3}ms`,
            }"
          />
          <rect
            v-for="(group, index) in layout.groups" :key="group.date"
            :x="group.column * 14"
            :y="view === 'daily' ? group.row * 14 : 0"
            width="14"
            :height="view === 'daily' ? 14 : 98"
            :class="['fill-transparent hover:fill-neutral-950/8 dark:hover:fill-white/10']"
            @pointerenter="selectGroup(index)"
            @pointerdown="selectGroup(index)"
          />
        </svg>
        <div aria-hidden="true" :class="['relative mt-3 h-4 text-xs text-neutral-400 dark:text-neutral-500']">
          <span
            v-for="label in monthLabels" :key="label.column"
            :class="['absolute whitespace-nowrap']"
            :style="{ left: `${label.column / layout.weekCount * 100}%` }"
          >{{ label.text }}</span>
        </div>
      </div>
    </div>
    <p :id="`${chartId}-hint`" :class="['sr-only']">
      {{ t('settings.pages.flux.usage.keyboardHint') }}
    </p>

    <div
      v-if="activeGroup"
      role="status"
      :class="[
        'pointer-events-none absolute z-1 w-max max-w-50 -translate-x-1/2 -translate-y-full',
        'rounded-xl px-3 py-2 text-xs shadow-lg',
        'bg-neutral-950 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-950',
      ]"
      :style="{ left: `${tooltipPosition.left}px`, top: `${tooltipPosition.top}px` }"
    >
      <p :class="['font-medium']">
        {{ tooltipTitle }}
      </p>
      <p :class="['tabular-nums opacity-80']">
        {{ t('settings.pages.flux.usage.fluxAmount', { amount: formatFlux(activeGroup.microFlux, locale) }) }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.activity-tile {
  transition:
    transform 600ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 350ms ease,
    fill 350ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .activity-tile {
    transition: none;
  }
}
</style>
