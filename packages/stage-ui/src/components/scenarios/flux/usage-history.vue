<script setup lang="ts">
import type { FluxHistoryResponse } from '@proj-airi/api-server/types/flux-usage'

import { Alert, Button } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from '../../../composables/api'
import { useAuthStore } from '../../../stores/auth'

type AuditRecord = FluxHistoryResponse['records'][number]

const { t } = useI18n()
const authStore = useAuthStore()
const owner = computed(() => authStore.isAuthenticated && authStore.isSessionVerified
  ? `${authStore.userId}:${authStore.sessionVersion}`
  : null)
const loadError = ref(false)
let activeRequest: AbortController | undefined

function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' ? -record.amount : record.amount
  const formatted = new Intl.NumberFormat().format(Math.abs(signed))
  return signed >= 0 ? `+${formatted}` : `-${formatted}`
}

const TYPE_LABEL_KEY: Record<string, string> = {
  debit: 'settings.pages.flux.audit.typeConsumption',
  credit: 'settings.pages.flux.audit.typeAddition',
  initial: 'settings.pages.flux.audit.typeInitial',
  promo: 'settings.pages.flux.audit.typePromo',
}

function typeLabel(type: string): string {
  return t(TYPE_LABEL_KEY[type] ?? TYPE_LABEL_KEY.initial)
}

const auditRecords = ref<AuditRecord[]>([])
const auditLoading = ref(false)
const auditHasMore = ref(false)
const auditOffset = ref(0)
const AUDIT_PAGE_SIZE = 20

async function fetchAuditHistory(loadMore = false) {
  const request = activeRequest
  if (!request || request.signal.aborted || auditLoading.value)
    return
  auditLoading.value = true
  loadError.value = false
  try {
    const offset = loadMore ? auditOffset.value : 0
    const response = await client.api.v1.flux.history.$get({
      query: { limit: String(AUDIT_PAGE_SIZE), offset: String(offset) },
    }, { init: { signal: request.signal } })
    if (!response.ok)
      throw new Error('History request failed')
    const data = await response.json()
    if (request.signal.aborted)
      return
    auditRecords.value = loadMore ? [...auditRecords.value, ...data.records] : data.records
    auditHasMore.value = data.hasMore
    auditOffset.value = offset + data.records.length
  }
  catch {
    if (!request.signal.aborted)
      loadError.value = true
  }
  finally {
    if (!request.signal.aborted)
      auditLoading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

// Each session owns its requests. Teardown and account changes abort the old session before loading another.
watch(owner, (value, _previous, onCleanup) => {
  auditRecords.value = []
  auditOffset.value = 0
  auditHasMore.value = false
  auditLoading.value = false
  loadError.value = false
  if (!value)
    return
  const request = new AbortController()
  activeRequest = request
  onCleanup(() => {
    request.abort()
    activeRequest = undefined
  })
  void fetchAuditHistory()
}, { immediate: true })
</script>

<template>
  <section :class="['flex flex-col gap-3']" :aria-busy="auditLoading">
    <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.audit.delayHint') }}
    </p>
    <Alert v-if="loadError" tone="danger">
      {{ t('settings.pages.flux.usage.loadError') }}
      <template #actions>
        <Button :label="t('settings.pages.flux.usage.retry')" @click="fetchAuditHistory(auditRecords.length > 0)" />
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
              {{ record.description }}
            </td>
            <td
              :class="['px-4 py-3 text-right font-mono', record.type === 'debit'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-green-600 dark:text-green-400']"
            >
              {{ displayAmount(record) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="auditRecords.length > 0" role="list" :class="['flex flex-col gap-2 sm:hidden']">
      <div
        v-for="record in auditRecords" :key="record.id"
        role="listitem"
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
          <span
            :class="['text-sm font-semibold font-mono', record.type === 'debit'
              ? 'text-orange-600 dark:text-orange-400'
              : 'text-green-600 dark:text-green-400']"
          >
            {{ displayAmount(record) }}
          </span>
        </div>
        <div :class="['text-sm text-neutral-600 dark:text-neutral-300 truncate']">
          {{ record.description }}
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
        @click="fetchAuditHistory(true)"
      />
    </div>
  </section>
</template>
