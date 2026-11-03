<script setup lang="ts">
import type { DailyUsageSummary } from './usage-stats'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UsageActivityChart from './usage-activity-chart.vue'

import { computeStreaks, formatDuration, formatFlux } from './usage-stats'

const props = defineProps<{ summary: DailyUsageSummary }>()
const { t, locale } = useI18n()

const totalFlux = computed(() => props.summary.days.reduce((sum, day) => sum + day.microFlux, 0))
const cards = computed(() => {
  const streaks = computeStreaks(props.summary.days)
  const dayCount = new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'day', unitDisplay: 'narrow' })
  return [
    { key: 'flux', value: formatFlux(totalFlux.value, locale.value) },
    { key: 'peakFlux', value: formatFlux(Math.max(0, ...props.summary.days.map(day => day.microFlux)), locale.value) },
    { key: 'longestSession', value: formatDuration(props.summary.longestSessionMs, locale.value) },
    { key: 'longestStreak', value: dayCount.format(streaks.longest) },
    { key: 'currentStreak', value: dayCount.format(streaks.current) },
  ]
})
</script>

<template>
  <section :class="['flex w-full flex-col gap-6']">
    <p v-if="totalFlux === 0 && summary.longestSessionMs === 0" :class="['py-4 text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.usage.empty') }}
    </p>
    <template v-else>
      <dl :class="['grid grid-cols-2 gap-y-5 sm:grid-cols-5', 'border-y border-neutral-100 py-4 dark:border-neutral-900']">
        <div
          v-for="card in cards" :key="card.key"
          :class="['flex flex-col-reverse items-center gap-1 px-3 text-center', 'sm:not-first:border-l sm:border-neutral-100 dark:sm:border-neutral-900']"
        >
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t(`settings.pages.flux.usage.summary.${card.key}`) }}
          </dt>
          <dd :class="['text-sm font-medium tabular-nums']">
            {{ card.value }}
          </dd>
        </div>
      </dl>
      <UsageActivityChart :days="summary.days" />
    </template>
  </section>
</template>
