<script setup lang="ts">
import type { InferResponseType } from 'hono/client'

import type { StageApiClient } from '../../../composables/api'

import { Alert, Button } from '@proj-airi/ui'
import { useAsyncState } from '@vueuse/core'
import { intlFormat, parseISO } from 'date-fns'
import { noop } from 'es-toolkit'
import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from '../../../composables/api'

type AuditRecord = InferResponseType<StageApiClient['api']['v1']['flux']['history']['$get']>['records'][number]

const { t, locale } = useI18n()
const request = new AbortController()
onScopeDispose(() => request.abort())

function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' && record.amount > 0 ? -record.amount : record.amount
  return new Intl.NumberFormat(locale.value, { signDisplay: 'always' }).format(signed)
}

function typeLabel(type: string): string {
  switch (type) {
    case 'debit': return t('settings.pages.flux.audit.typeConsumption')
    case 'credit': return t('settings.pages.flux.audit.typeAddition')
    case 'initial': return t('settings.pages.flux.audit.typeInitial')
    case 'promo': return t('settings.pages.flux.audit.typePromo')
    default: return type
  }
}

const auditRecords = shallowRef<AuditRecord[]>([])
const auditHasMore = ref(false)
const AUDIT_PAGE_SIZE = 20
const { isLoading: auditLoading, error: loadError, execute } = useAsyncState(async () => {
  const response = await client.api.v1.flux.history.$get({
    query: { limit: String(AUDIT_PAGE_SIZE), offset: String(auditRecords.value.length) },
  }, { init: { signal: request.signal } })
  if (!response.ok)
    throw new Error('History request failed')
  const data = await response.json()
  if (request.signal.aborted)
    return
  auditRecords.value = [...auditRecords.value, ...data.records]
  auditHasMore.value = data.hasMore
}, undefined, { immediate: false, onError: noop })

function fetchAuditHistory() {
  if (!request.signal.aborted && !auditLoading.value)
    void execute()
}

function describeMetadata(record: AuditRecord): string {
  const metadata = record.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return ''
  if (typeof metadata.promptTokens === 'number' && typeof metadata.completionTokens === 'number')
    return t('settings.pages.flux.audit.tokenCount', { prompt: metadata.promptTokens, completion: metadata.completionTokens })
  return ''
}

function formatDate(iso: string): string {
  return intlFormat(parseISO(iso), { dateStyle: 'medium', timeStyle: 'short' }, { locale: locale.value })
}

onMounted(fetchAuditHistory)
</script>

<template>
  <section :class="['flex flex-col gap-3']" :aria-busy="auditLoading">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.audit.delayHint') }}
    </p>
    <Alert v-if="loadError" tone="danger">
      {{ t('settings.pages.flux.usage.loadError') }}
      <template #actions>
        <Button :label="t('settings.pages.flux.usage.retry')" @click="fetchAuditHistory" />
      </template>
    </Alert>

    <div v-if="auditLoading && auditRecords.length === 0" :class="['text-sm text-neutral-500 py-4 text-center']">
      {{ t('settings.pages.flux.audit.loading') }}
    </div>

    <div v-else-if="!loadError && auditRecords.length === 0" :class="['text-sm text-neutral-500 py-4 text-center']">
      {{ t('settings.pages.flux.audit.empty') }}
    </div>

    <div v-if="auditRecords.length > 0" :class="['border-1 border-neutral-100 dark:border-neutral-900 overflow-x-auto rounded-xl hidden sm:block']">
      <table :class="['w-full text-sm']">
        <thead :class="['border-b border-neutral-100 dark:border-neutral-900']">
          <tr>
            <th :class="['px-4 py-3 text-left font-medium']">
              {{ t('settings.pages.flux.audit.time') }}
            </th>
            <th :class="['px-4 py-3 text-left font-medium']">
              {{ t('settings.pages.flux.audit.type') }}
            </th>
            <th :class="['px-4 py-3 text-left font-medium']">
              {{ t('settings.pages.flux.audit.detail') }}
            </th>
            <th :class="['px-4 py-3 text-right font-medium']">
              {{ t('settings.pages.flux.audit.amount') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="record in auditRecords" :key="record.id"
            :class="['border-b border-neutral-100 dark:border-neutral-900/50 last:border-none']"
          >
            <td :class="['whitespace-nowrap px-4 py-3 text-neutral-500']">
              {{ formatDate(record.createdAt) }}
            </td>
            <td :class="['px-4 py-3']">
              <span
                :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', record.type === 'debit'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400']"
              >
                {{ typeLabel(record.type) }}
              </span>
            </td>
            <td :class="['px-4 py-3']">
              <span>{{ record.description }}</span>
              <span v-if="describeMetadata(record)" :class="['ml-1 text-xs text-neutral-400']">
                ({{ describeMetadata(record) }})
              </span>
            </td>
            <td :class="['px-4 py-3 text-right font-mono']">
              <span :class="record.type === 'debit' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'">
                {{ displayAmount(record) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="auditRecords.length > 0" role="list" :class="['flex flex-col gap-2 sm:hidden']">
      <div
        v-for="record in auditRecords" :key="record.id" role="listitem"
        :class="['border-1 border-neutral-100 dark:border-neutral-900 flex flex-col gap-1.5 rounded-lg px-3 py-2.5']"
      >
        <div :class="['flex items-center justify-between']">
          <span
            :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', record.type === 'debit'
              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
              : 'bg-green-500/10 text-green-600 dark:text-green-400']"
          >
            {{ typeLabel(record.type) }}
          </span>
          <span :class="['text-sm font-semibold font-mono', record.type === 'debit' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400']">
            {{ displayAmount(record) }}
          </span>
        </div>
        <div :class="['text-sm text-neutral-600 dark:text-neutral-300 truncate']">
          {{ record.description }}
          <span v-if="describeMetadata(record)" :class="['ml-1 text-xs text-neutral-400']">
            ({{ describeMetadata(record) }})
          </span>
        </div>
        <div :class="['text-xs text-neutral-400']">
          {{ formatDate(record.createdAt) }}
        </div>
      </div>
    </div>

    <div v-if="auditHasMore" :class="['text-center']">
      <Button
        :label="t('settings.pages.flux.audit.loadMore')"
        :loading="auditLoading"
        @click="fetchAuditHistory"
      />
    </div>
  </section>
</template>
