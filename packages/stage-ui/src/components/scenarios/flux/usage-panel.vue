<script setup lang="ts">
import { Alert, Button, SettingsCard, Skeleton } from '@proj-airi/ui'
import { useAsyncState } from '@vueuse/core'
import { computed, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UsageActivityChart from './usage-activity-chart.vue'

import { client } from '../../../composables/api'
import { computeStreaks, formatFlux } from './usage-stats'

const { t, locale } = useI18n()
const request = new AbortController()
onScopeDispose(() => request.abort())
const { state: summary, error, isLoading, execute } = useAsyncState(async () => {
  const response = await client.api.v1.flux.usage.daily.$get({
    query: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  }, { init: { signal: request.signal } })
  if (!response.ok)
    throw new Error('Usage request failed')
  return response.json()
}, undefined)

const overview = computed(() => {
  const data = summary.value
  if (!data)
    return
  const totalFlux = data.days.reduce((sum, day) => sum + day.microFlux, 0)
  const streaks = computeStreaks(data.days)
  const dayCount = new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'day', unitDisplay: 'narrow' })
  return {
    empty: totalFlux === 0,
    days: data.days,
    cards: [
      { label: t('settings.pages.flux.usage.summary.flux'), value: formatFlux(totalFlux, locale.value) },
      { label: t('settings.pages.flux.usage.summary.peakFlux'), value: formatFlux(Math.max(0, ...data.days.map(day => day.microFlux)), locale.value) },
      { label: t('settings.pages.flux.usage.summary.longestStreak'), value: dayCount.format(streaks.longest) },
      { label: t('settings.pages.flux.usage.summary.currentStreak'), value: dayCount.format(streaks.current) },
    ],
  }
})
</script>

<template>
  <section :aria-busy="isLoading" :class="['flex min-w-0 flex-col gap-4']">
    <Skeleton v-if="isLoading" :class="['h-64 w-full rounded-xl']" />
    <Alert v-else-if="error" tone="danger">
      {{ t('settings.pages.flux.usage.loadError') }}
      <template #actions>
        <Button :label="t('settings.pages.flux.usage.retry')" @click="execute(0)" />
      </template>
    </Alert>
    <section v-else-if="overview" :class="['flex w-full flex-col gap-6']">
      <p v-if="overview.empty" :class="['py-4 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.flux.usage.empty') }}
      </p>
      <template v-else>
        <dl :class="['grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3']">
          <SettingsCard
            v-for="card in overview.cards" :key="card.label"
            :class="['box-border min-w-0']"
          >
            <dt :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              {{ card.label }}
            </dt>
            <dd :class="['text-2xl text-neutral-900 font-bold tracking-tight tabular-nums dark:text-neutral-50']">
              {{ card.value }}
            </dd>
          </SettingsCard>
        </dl>
        <UsageActivityChart :days="overview.days" />
      </template>
    </section>
    <RouterLink
      to="/settings/usage"
      :class="[
        'inline-flex min-h-9 items-center gap-1 self-end rounded-lg px-3 py-1.5 text-sm',
        'text-primary-600 hover:bg-primary-500/10 dark:text-primary-400',
        'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
      ]"
    >
      {{ t('settings.pages.flux.usage.details') }}
      <span aria-hidden="true" :class="['i-solar:alt-arrow-right-linear size-4']" />
    </RouterLink>
  </section>
</template>
