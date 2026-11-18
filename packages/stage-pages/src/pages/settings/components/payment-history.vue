<script setup lang="ts">
import { useInfiniteQuery } from '@pinia/colada'
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, Button, GhostButton, Skeleton, Table, TableCell, TableHead } from '@proj-airi/ui'
import { intlFormat, parseISO } from 'date-fns'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import PaymentReceiptButton from './payment-receipt-button.vue'

import { formatPaymentAmount } from './payment-history'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const route = useRoute()
const receiptError = ref(false)
const { data, error, isLoading, hasNextPage, loadNextPage, refetch } = useInfiniteQuery({
  key: () => ['payment-orders', authStore.user?.id ?? null, authStore.sessionVersion],
  enabled: () => authStore.isAuthenticated && authStore.isSessionVerified,
  initialPageParam: 0,
  staleTime: route.query.success === 'true' ? 0 : 60_000,
  gcTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  query: async ({ pageParam, signal }) => {
    const response = await client.api.v1.payments.$get({
      query: { limit: '20', offset: String(pageParam) },
    }, { init: { signal } })
    if (!response.ok)
      throw new Error('Failed to load payment orders')
    return response.json()
  },
  getNextPageParam: (lastPage, _pages, offset) => lastPage.hasMore ? offset + lastPage.records.length : undefined,
})
const records = computed(() => authStore.isAuthenticated && authStore.isSessionVerified ? data.value?.pages.flatMap(page => page.records) : undefined)
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

function formatDate(iso: string) {
  return intlFormat(parseISO(iso), { dateStyle: 'medium', timeStyle: 'short' }, { locale: locale.value })
}
</script>

<template>
  <section data-testid="payment-history" :class="['flex flex-col gap-3']" :aria-busy="isLoading || !authStore.isSessionVerified">
    <div :class="['flex items-center justify-between gap-3']">
      <h2 :class="['text-lg font-semibold']">
        {{ t('settings.pages.billing.receipts') }}
      </h2>
      <GhostButton size="sm" icon="i-solar:refresh-linear" :label="t('settings.pages.billing.refresh')" :loading="isLoading" :disabled="!authStore.isSessionVerified" @click="refetch()" />
    </div>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.billing.receiptsHint') }}
    </p>
    <Alert v-if="receiptError" tone="danger" live="polite">
      {{ t('settings.pages.billing.receiptError') }}
    </Alert>
    <Alert v-if="error" tone="danger" live="polite">
      <div :class="['flex items-center justify-between gap-3']">
        {{ t('settings.pages.billing.loadError') }}
        <Button size="sm" :label="t('settings.pages.billing.retry')" :loading="isLoading" :disabled="!authStore.isSessionVerified" @click="refetch()" />
      </div>
    </Alert>
    <div v-if="(isLoading || !authStore.isSessionVerified) && !records?.length" :class="['flex flex-col gap-2']">
      <Skeleton v-for="i in 3" :key="i" :class="['h-14 rounded-xl']" />
    </div>
    <p v-else-if="!records?.length && !error" :class="['py-4 text-center text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.billing.empty') }}
    </p>
    <Table v-if="records?.length" framed container-class="hidden sm:block">
      <template #header>
        <tr>
          <TableHead>{{ t('settings.pages.billing.date') }}</TableHead>
          <TableHead>{{ t('settings.pages.billing.descriptionColumn') }}</TableHead>
          <TableHead>{{ t('settings.pages.billing.status') }}</TableHead>
          <TableHead align="right">
            {{ t('settings.pages.billing.amount') }}
          </TableHead>
          <TableHead align="right">
            {{ t('settings.pages.billing.receipt') }}
          </TableHead>
        </tr>
      </template>

      <tr v-for="record in records" :key="record.id">
        <TableCell :class="['whitespace-nowrap text-neutral-500 dark:text-neutral-400']">
          {{ formatDate(record.creditedAt ?? record.createdAt) }}
        </TableCell>
        <TableCell>
          {{ record.fluxAmount === null ? t('settings.pages.billing.topUp') : t('settings.pages.billing.fluxTopUp', { amount: numberFormat.format(record.fluxAmount) }) }}
        </TableCell>
        <TableCell>{{ t('settings.pages.billing.paid') }}</TableCell>
        <TableCell align="right" :class="['whitespace-nowrap tabular-nums']">
          {{ formatPaymentAmount(record.amount, record.currency, record.processor, locale) ?? t('settings.pages.billing.unavailable') }}
        </TableCell>
        <TableCell compact align="right">
          <PaymentReceiptButton :order-id="record.id" @error="receiptError = true" @start="receiptError = false" />
        </TableCell>
      </tr>
    </Table>
    <div v-if="records?.length" :class="['flex flex-col gap-2 sm:hidden']">
      <article v-for="record in records" :key="record.id" :class="['flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100/60 dark:bg-neutral-800/40']">
        <div :class="['flex items-baseline justify-between gap-3']">
          <span>{{ record.fluxAmount === null ? t('settings.pages.billing.topUp') : t('settings.pages.billing.fluxTopUp', { amount: numberFormat.format(record.fluxAmount) }) }}</span>
          <span :class="['shrink-0 tabular-nums']">{{ formatPaymentAmount(record.amount, record.currency, record.processor, locale) ?? t('settings.pages.billing.unavailable') }}</span>
        </div>
        <time :datetime="record.creditedAt ?? record.createdAt" :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ formatDate(record.creditedAt ?? record.createdAt) }}</time>
        <div :class="['flex items-center justify-between gap-3']">
          <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">{{ t('settings.pages.billing.paid') }}</span>
          <PaymentReceiptButton :order-id="record.id" @error="receiptError = true" @start="receiptError = false" />
        </div>
      </article>
    </div>
    <div v-if="hasNextPage" :class="['text-center']">
      <Button :label="t('settings.pages.billing.loadMore')" :loading="isLoading" @click="loadNextPage({ cancelRefetch: false })" />
    </div>
  </section>
</template>
