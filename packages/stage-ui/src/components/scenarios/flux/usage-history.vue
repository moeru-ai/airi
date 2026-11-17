<script setup lang="ts">
import type { InferResponseType } from 'hono/client'

import type { StageApiClient } from '../../../composables/api'

import { Alert, Button, GhostButton } from '@proj-airi/ui'
import { useAsyncState } from '@vueuse/core'
import { noop } from 'es-toolkit'
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from '../../../composables/api'

type AuditRecord = InferResponseType<StageApiClient['api']['v1']['flux']['history']['$get']>['records'][number]

const { t, locale } = useI18n()
const request = new AbortController()
onScopeDispose(() => request.abort())

function displayAmount(record: AuditRecord, amount = record.amount): string {
  const signed = record.type === 'debit' && amount > 0 ? -amount : amount
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

function isSpeechDebit(record: AuditRecord): boolean {
  // NOTICE:
  // The wallet history uses the description prefix to show details for older speech debits.
  // Those rows have no structured field that identifies speech.
  // Source: packages/stage-pages/src/pages/settings/flux.vue at 26b691f57.
  // Remove this check when history no longer contains rows without a structured speech marker.
  return record.type === 'debit' && record.description?.startsWith('tts:') === true
}

function describeMetadata(record: AuditRecord): string {
  const metadata = record.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return ''
  if (typeof metadata.promptTokens === 'number' && typeof metadata.completionTokens === 'number')
    return t('settings.pages.flux.audit.tokenCount', { prompt: metadata.promptTokens, completion: metadata.completionTokens })
  if (isSpeechDebit(record) && typeof metadata.model === 'string')
    return metadata.model
  return ''
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

interface GroupedRow {
  record: AuditRecord
  records: AuditRecord[]
  totalAmount: number
  details: string
}

const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key))
    expandedGroups.value.delete(key)
  else
    expandedGroups.value.add(key)
}

const groupedRows = computed<GroupedRow[]>(() => {
  const rows: GroupedRow[] = []
  for (const record of auditRecords.value) {
    const previous = rows.at(-1)
    if (isSpeechDebit(record)
      && previous?.record.type === 'debit' && previous.record.description === record.description) {
      previous.records.push(record)
      previous.totalAmount += record.amount
      continue
    }
    rows.push({ record, records: [record], totalAmount: record.amount, details: describeMetadata(record) })
  }

  return rows
})

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
          <template v-for="row in groupedRows" :key="row.record.id">
            <tr
              :class="['border-b border-neutral-100 dark:border-neutral-900/50', row.records.length === 1 && 'last:border-none']"
            >
              <td :class="['whitespace-nowrap px-4 py-3 text-neutral-500']">
                {{ formatDate(row.record.createdAt) }}
              </td>
              <td :class="['px-4 py-3']">
                <span
                  :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', row.record.type === 'debit'
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400']"
                >
                  {{ typeLabel(row.record.type) }}
                </span>
              </td>
              <td :class="['px-4 py-3']">
                <GhostButton
                  v-if="row.records.length > 1" size="unset"
                  :aria-expanded="expandedGroups.has(row.record.id)" @click="toggleGroup(row.record.id)"
                >
                  <span
                    :class="['inline-block size-4 text-neutral-400', expandedGroups.has(row.record.id) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone']"
                  />
                  {{ row.record.description }}
                  <span :class="['ml-1 text-xs text-neutral-400']">
                    ({{ row.records.length }} {{ t('settings.pages.flux.audit.ttsRequests') }})
                  </span>
                </GhostButton>
                <template v-else>
                  <span>{{ row.record.description }}</span>
                  <span v-if="row.details" :class="['ml-1 text-xs text-neutral-400']">
                    ({{ row.details }})
                  </span>
                </template>
              </td>
              <td :class="['px-4 py-3 text-right font-mono']">
                <span :class="row.record.type === 'debit' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'">
                  {{ displayAmount(row.record, row.totalAmount) }}
                </span>
              </td>
            </tr>

            <tr
              v-for="child in (row.records.length > 1 && expandedGroups.has(row.record.id) ? row.records : [])"
              :key="child.id"
              :class="['border-b border-neutral-100 dark:border-neutral-900/50 last:border-none bg-neutral-50/50 dark:bg-neutral-800/20']"
            >
              <td :class="['whitespace-nowrap px-4 py-2 pl-8 text-xs text-neutral-400']">
                {{ formatDate(child.createdAt) }}
              </td>
              <td :class="['px-4 py-2']" />
              <td :class="['px-4 py-2 text-xs text-neutral-400']">
                {{ child.description }}
              </td>
              <td :class="['px-4 py-2 text-right font-mono text-xs text-orange-500 dark:text-orange-400']">
                {{ displayAmount(child) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="auditRecords.length > 0" role="list" :class="['flex flex-col gap-2 sm:hidden']">
      <div
        v-for="row in groupedRows" :key="row.record.id" role="listitem"
        :class="['border-1 border-neutral-100 dark:border-neutral-900 flex flex-col gap-1.5 rounded-lg px-3 py-2.5']"
      >
        <div :class="['flex items-center justify-between']">
          <span
            :class="['inline-block rounded-full px-2 py-0.5 text-xs font-medium', row.record.type === 'debit'
              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
              : 'bg-green-500/10 text-green-600 dark:text-green-400']"
          >
            {{ typeLabel(row.record.type) }}
          </span>
          <span :class="['text-sm font-semibold font-mono', row.record.type === 'debit' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400']">
            {{ displayAmount(row.record, row.totalAmount) }}
          </span>
        </div>
        <GhostButton
          v-if="row.records.length > 1" size="unset" :class="['self-start text-sm']"
          :aria-expanded="expandedGroups.has(row.record.id)" @click="toggleGroup(row.record.id)"
        >
          <span
            :class="['inline-block size-4 text-neutral-400', expandedGroups.has(row.record.id) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone']"
          />
          {{ row.record.description }}
          <span :class="['text-xs text-neutral-400']">({{ row.records.length }} {{ t('settings.pages.flux.audit.ttsRequests') }})</span>
        </GhostButton>
        <div v-else :class="['text-sm text-neutral-600 dark:text-neutral-300 truncate']">
          {{ row.record.description }}
          <span v-if="row.details" :class="['ml-1 text-xs text-neutral-400']">
            ({{ row.details }})
          </span>
        </div>
        <div :class="['text-xs text-neutral-400']">
          {{ formatDate(row.record.createdAt) }}
        </div>
        <div v-if="row.records.length > 1 && expandedGroups.has(row.record.id)" :class="['flex flex-col gap-1 mt-1 border-t border-neutral-100 dark:border-neutral-900 pt-2']">
          <div
            v-for="child in row.records" :key="child.id"
            :class="['flex items-center justify-between text-xs text-neutral-400']"
          >
            <span>{{ formatDate(child.createdAt) }}</span>
            <span :class="['font-mono']">{{ displayAmount(child) }}</span>
          </div>
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
