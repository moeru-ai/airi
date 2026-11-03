<script setup lang="ts">
import type { DailyUsageSummary } from './usage-stats'

import { SettingsCard } from '@proj-airi/ui'
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
      <dl :class="['grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3']">
        <SettingsCard
          v-for="card in cards" :key="card.key"
          :class="['box-border min-w-0']"
        >
          <dt :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t(`settings.pages.flux.usage.summary.${card.key}`) }}
          </dt>
          <dd :class="['text-2xl text-neutral-900 font-bold tracking-tight tabular-nums dark:text-neutral-50']">
            {{ card.value }}
          </dd>
        </SettingsCard>
      </dl>
      <UsageActivityChart :days="summary.days" />
    </template>
  </section>
</template>
