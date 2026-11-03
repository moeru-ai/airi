<script setup lang="ts">
import type { DailyUsageSummary } from './usage-stats'

import { Alert, Button, Skeleton } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import UsageOverview from './usage-overview.vue'

import { client } from '../../../composables/api'
import { useAuthStore } from '../../../stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const owner = computed(() => authStore.isAuthenticated && authStore.isSessionVerified
  ? `${authStore.userId}:${authStore.sessionVersion}`
  : null)
const summary = shallowRef<DailyUsageSummary | null>(null)
const loading = ref(false)
const failed = ref(false)
const reload = ref(0)

// A session owns its summary. Navigation, sign-out, and account changes cancel pending requests and discard old data.
watch([owner, reload], async ([user], _previous, onCleanup) => {
  summary.value = null
  failed.value = false
  loading.value = false
  if (!user)
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
    <UsageOverview v-else-if="summary" :summary="summary" />
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
