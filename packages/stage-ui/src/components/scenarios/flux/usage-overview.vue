<script setup lang="ts">
import type { DailyUsageSummary } from './usage-stats'

import { computed } from 'vue'
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

const { t, locale } = useI18n()

const recentDays = computed(() => lastDays(props.summary.days, RECENT_DAYS))
const streaks = computed(() => computeStreaks(props.summary.days))
const totalFlux = computed(() => props.summary.days.reduce((sum, day) => sum + totalMicroFlux(day), 0))
const totalSessions = computed(() => props.summary.days.reduce((sum, day) => sum + day.newSessionCount, 0))
const hasUsage = computed(() => totalFlux.value > 0 || totalSessions.value > 0)

const cards = computed(() => [
  { key: 'longestSession', value: formatDuration(props.summary.longestSessionMs, locale.value) },
  { key: 'sessions', value: new Intl.NumberFormat(locale.value).format(totalSessions.value) },
  { key: 'flux', value: formatFlux(totalFlux.value, locale.value) },
  { key: 'longestStreak', value: t('settings.pages.flux.usage.days', { count: streaks.value.longest }) },
  { key: 'currentStreak', value: t('settings.pages.flux.usage.days', { count: streaks.value.current }) },
])
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2']">
      <h3 :class="['text-lg font-semibold']">
        {{ t('settings.pages.flux.usage.title') }}
      </h3>
      <span :class="['text-xs text-neutral-400']">
        {{ t('settings.pages.flux.usage.rangeHint') }}
      </span>
    </div>

    <p v-if="!hasUsage" :class="['py-4 text-center text-sm text-neutral-500']">
      {{ t('settings.pages.flux.usage.empty') }}
    </p>

    <template v-else>
      <dl :class="['grid grid-cols-2 gap-4 sm:grid-cols-5']">
        <div v-for="card in cards" :key="card.key" :class="['flex flex-col gap-0.5']">
          <dt :class="['text-xs font-medium', 'text-neutral-500 dark:text-neutral-400']">
            {{ t(`settings.pages.flux.usage.summary.${card.key}`) }}
          </dt>
          <dd :class="['text-2xl font-semibold tracking-tight']">
            {{ card.value }}
          </dd>
        </div>
      </dl>

      <UsageHeatmap :days="summary.days" />
      <UsageAreaChart :days="recentDays" />
      <UsageSessionChart :days="recentDays" />
    </template>
  </div>
</template>
