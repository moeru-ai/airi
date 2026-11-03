<script setup lang="ts">
import type { DailyUsageSummary } from '@proj-airi/api-server/types/flux-usage'

import { Alert, Button, SettingsCard, Skeleton } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UsageActivityChart from './usage-activity-chart.vue'

import { client } from '../../../composables/api'
import { useAuthStore } from '../../../stores/auth'
import { computeStreaks, formatDuration, formatFlux } from './usage-stats'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const owner = computed(() => authStore.isAuthenticated && authStore.isSessionVerified
  ? `${authStore.userId}:${authStore.sessionVersion}`
  : null)
const summary = shallowRef<DailyUsageSummary | null>(null)
const loading = ref(false)
const failed = ref(false)
const reload = ref(0)

const overview = computed(() => {
  const data = summary.value
  if (!data)
    return
  const totalFlux = data.days.reduce((sum, day) => sum + day.microFlux, 0)
  const streaks = computeStreaks(data.days)
  const dayCount = new Intl.NumberFormat(locale.value, { style: 'unit', unit: 'day', unitDisplay: 'narrow' })
  return {
    empty: totalFlux === 0 && data.longestSessionMs === 0,
    days: data.days,
    cards: [
      { key: 'flux', value: formatFlux(totalFlux, locale.value) },
      { key: 'peakFlux', value: formatFlux(Math.max(0, ...data.days.map(day => day.microFlux)), locale.value) },
      { key: 'longestSession', value: formatDuration(data.longestSessionMs, locale.value) },
      { key: 'longestStreak', value: dayCount.format(streaks.longest) },
      { key: 'currentStreak', value: dayCount.format(streaks.current) },
    ],
  }
})

// A session owns its summary. Navigation, sign-out, and account changes cancel pending requests and discard old data.
watch([owner, reload], async ([session], _previous, onCleanup) => {
  summary.value = null
  failed.value = false
  loading.value = false
  if (!session)
    return
  const request = new AbortController()
  onCleanup(() => request.abort())
  loading.value = true
  try {
    const response = await client.api.v1.flux.usage.daily.$get({
      query: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }, { init: { signal: request.signal } })
    if (!response.ok)
      throw new Error('Usage request failed')
    const data = await response.json()
    if (!request.signal.aborted)
      summary.value = data
  }
  catch {
    if (!request.signal.aborted)
      failed.value = true
  }
  finally {
    if (!request.signal.aborted)
      loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <section v-if="owner" :aria-busy="loading" :class="['flex min-w-0 flex-col gap-4']">
    <Skeleton v-if="loading" :class="['h-64 w-full rounded-xl']" />
    <Alert v-else-if="failed" tone="danger">
      {{ t('settings.pages.flux.usage.loadError') }}
      <template #actions>
        <Button :label="t('settings.pages.flux.usage.retry')" @click="reload++" />
      </template>
    </Alert>
    <section v-else-if="overview" :class="['flex w-full flex-col gap-6']">
      <p v-if="overview.empty" :class="['py-4 text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.flux.usage.empty') }}
      </p>
      <template v-else>
        <dl :class="['grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3']">
          <SettingsCard
            v-for="card in overview.cards" :key="card.key"
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
