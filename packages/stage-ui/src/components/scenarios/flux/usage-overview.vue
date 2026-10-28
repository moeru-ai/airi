<script setup lang="ts">
import type { DailyUsageSummary } from './usage-stats'

import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageAreaChart from './usage-area-chart.vue'
import UsageHeatmap from './usage-heatmap.vue'
import UsageSessionChart from './usage-session-chart.vue'

import { computeStreaks, formatDuration, formatFlux, lastDays, totalMicroFlux } from './usage-stats'

const props = defineProps<{
  summary: DailyUsageSummary
}>()

/** The area chart and the session chart show this many of the newest days. */
const RECENT_DAYS = 30

/**
 * The three charts share this width.
 * A narrower page scrolls the three charts together.
 * 768 keeps the year heat map near its drawn size of 12px dots.
 */
const CHART_TRACK_WIDTH = 768

const { t, locale } = useI18n()
const chartScroll = ref<HTMLElement>()

const recentDays = computed(() => lastDays(props.summary.days, RECENT_DAYS))
const streaks = computed(() => computeStreaks(props.summary.days))
const totalFlux = computed(() => props.summary.days.reduce((sum, day) => sum + totalMicroFlux(day), 0))
const totalSessions = computed(() => props.summary.days.reduce((sum, day) => sum + day.newSessionCount, 0))
const hasUsage = computed(() => totalFlux.value > 0 || totalSessions.value > 0)

// The newest days are on the right, so a narrow page opens there.
watch(() => props.summary.days.length, async () => {
  await nextTick()
  if (chartScroll.value)
    chartScroll.value.scrollLeft = chartScroll.value.scrollWidth
}, { immediate: true, flush: 'post' })

const cards = computed(() => [
  { key: 'longestSession', value: formatDuration(props.summary.longestSessionMs, locale.value) },
  { key: 'sessions', value: new Intl.NumberFormat(locale.value).format(totalSessions.value) },
  { key: 'flux', value: formatFlux(totalFlux.value, locale.value) },
  { key: 'longestStreak', value: t('settings.pages.flux.usage.days', { count: streaks.value.longest }) },
  { key: 'currentStreak', value: t('settings.pages.flux.usage.days', { count: streaks.value.current }) },
])
</script>

<template>
  <section :class="['flex w-full flex-col gap-8']">
    <h3 :class="['text-lg font-semibold']">
      {{ t('settings.pages.flux.usage.title') }}
    </h3>

    <p v-if="!hasUsage" :class="['py-4 text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.usage.empty') }}
    </p>

    <template v-else>
      <dl :class="['grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5']">
        <div v-for="card in cards" :key="card.key" :class="['flex flex-col gap-1']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t(`settings.pages.flux.usage.summary.${card.key}`) }}
          </dt>
          <dd :class="['text-xl font-semibold tabular-nums']">
            {{ card.value }}
          </dd>
        </div>
      </dl>

      <div ref="chartScroll" :class="['overflow-x-auto']">
        <div :class="['flex w-full flex-col gap-8']" :style="{ minWidth: `${CHART_TRACK_WIDTH}px` }">
          <UsageHeatmap :days="summary.days" />
          <UsageAreaChart :days="recentDays" />
          <UsageSessionChart :days="recentDays" />
        </div>
      </div>
    </template>
  </section>
</template>
