<script setup lang="ts">
import { useInfiniteQuery } from '@pinia/colada'
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, Button, GhostButton, Skeleton } from '@proj-airi/ui'
import { intlFormat, parseISO } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const { data, error, isLoading, hasNextPage, loadNextPage, refetch } = useInfiniteQuery({
  key: () => ['flux-usage', authStore.user?.id ?? null, authStore.sessionVersion],
  enabled: () => authStore.isAuthenticated && authStore.isSessionVerified,
  initialPageParam: 0,
  staleTime: 60_000,
  gcTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  query: async ({ pageParam, signal }) => {
    const response = await client.api.v1.flux.usage.$get({
      query: { limit: '20', offset: String(pageParam) },
    }, { init: { signal } })
    if (!response.ok)
      throw new Error('Failed to load Flux usage')
    return response.json()
  },
  getNextPageParam: (lastPage, _pages, offset) => lastPage.hasMore ? offset + lastPage.records.length : undefined,
})
const records = computed(() => authStore.isAuthenticated && authStore.isSessionVerified ? data.value?.pages.flatMap(page => page.records) : undefined)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }))

function formatDate(iso: string) {
  return intlFormat(parseISO(iso), { dateStyle: 'medium', timeStyle: 'short' }, { locale: locale.value })
}

function serviceLabel(sourceType: string) {
  switch (sourceType) {
    case 'llm': return t('settings.pages.usage.chat')
    case 'tts': return t('settings.pages.usage.speech')
    default: return t('settings.pages.usage.other')
  }
}
</script>

<template>
  <div :class="['flex min-h-full flex-col gap-4 p-4']">
    <div :class="['flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4']">
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.usage.hint') }}
      </p>
      <div :class="['flex shrink-0 items-center gap-3']">
        <GhostButton v-if="authStore.isAuthenticated" size="sm" icon="i-solar:refresh-linear" :label="t('settings.pages.billing.refresh')" :loading="isLoading" :disabled="!authStore.isSessionVerified" @click="refetch()" />
        <RouterLink to="/settings/flux" :class="['shrink-0 text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400']">
          {{ t('settings.pages.billing.title') }}
        </RouterLink>
      </div>
    </div>
    <div v-if="!authStore.isAuthenticated" :class="['flex flex-col items-center gap-3 py-8 text-sm text-neutral-500 dark:text-neutral-400']">
      <p>{{ t('settings.pages.usage.signIn') }}</p>
      <Button :label="t('settings.pages.usage.signInAction')" @click="authStore.requestLogin()" />
    </div>
    <section v-else :class="['flex flex-col gap-3']" :aria-busy="isLoading || !authStore.isSessionVerified" data-testid="flux-usage">
      <Alert v-if="error" tone="danger" live="polite">
        <div :class="['flex items-center justify-between gap-3']">
          {{ t('settings.pages.usage.loadError') }}
          <Button size="sm" :label="t('settings.pages.billing.retry')" :loading="isLoading" :disabled="!authStore.isSessionVerified" @click="refetch()" />
        </div>
      </Alert>
      <div v-if="(isLoading || !authStore.isSessionVerified) && !records?.length" :class="['flex flex-col gap-2']">
        <Skeleton v-for="i in 3" :key="i" :class="['h-14 rounded-xl']" />
      </div>
      <p v-else-if="!records?.length && !error" :class="['py-4 text-center text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.usage.empty') }}
      </p>
      <div v-if="records?.length" :class="['hidden overflow-x-auto rounded-xl sm:block', 'border border-neutral-200 dark:border-neutral-800']">
        <table :class="['w-full text-sm']">
          <thead :class="['border-b border-neutral-200 dark:border-neutral-800']">
            <tr>
              <th :class="['px-4 py-3 text-left font-medium']">
                {{ t('settings.pages.usage.date') }}
              </th>
              <th :class="['px-4 py-3 text-left font-medium']">
                {{ t('settings.pages.usage.service') }}
              </th>
              <th :class="['px-4 py-3 text-right font-medium']">
                {{ t('settings.pages.usage.flux') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in records" :key="record.id" :class="['border-b border-neutral-100 last:border-b-0 dark:border-neutral-800']">
              <td :class="['px-4 py-3 text-neutral-500 dark:text-neutral-400']">
                {{ formatDate(record.createdAt) }}
              </td>
              <td :class="['px-4 py-3']">
                {{ serviceLabel(record.sourceType) }}
              </td>
              <td :class="['px-4 py-3 text-right tabular-nums']">
                {{ numberFormat.format(record.amountMicroFlux / 1_000_000) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="records?.length" :class="['flex flex-col gap-2 sm:hidden']">
        <article v-for="record in records" :key="record.id" :class="['flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100/60 dark:bg-neutral-800/40']">
          <div :class="['flex items-center justify-between gap-3']">
            <span>{{ serviceLabel(record.sourceType) }}</span>
            <span :class="['tabular-nums']">{{ numberFormat.format(record.amountMicroFlux / 1_000_000) }} Flux</span>
          </div>
          <time :datetime="record.createdAt" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ formatDate(record.createdAt) }}</time>
        </article>
      </div>
      <div v-if="hasNextPage" :class="['text-center']">
        <Button :label="t('settings.pages.billing.loadMore')" :loading="isLoading" @click="loadNextPage({ cancelRefetch: false })" />
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  onboarding: false
  titleKey: settings.pages.usage.title
  descriptionKey: settings.pages.usage.description
  icon: i-solar:chart-2-bold-duotone
  settingsEntry: true
  order: 9
</route>
