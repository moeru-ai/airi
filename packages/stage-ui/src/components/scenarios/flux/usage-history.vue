<script setup lang="ts">
import type { FluxHistoryResponse } from '@proj-airi/api-server/types/flux-usage'

import { Alert, Button, GhostButton } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from '../../../composables/api'
import { useAuthStore } from '../../../stores/auth'

type AuditRecord = FluxHistoryResponse['records'][number]
type DisplayRecord = AuditRecord & { details: string }

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

function isPositive(record: AuditRecord): boolean {
  return record.type !== 'debit'
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

// Transaction metadata can hold any JSON value. Only structured token counts and speech model names add display details.
function describeMetadata(record: AuditRecord): string {
  const metadata = record.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return ''
  if ('promptTokens' in metadata && 'completionTokens' in metadata && typeof metadata.promptTokens === 'number' && typeof metadata.completionTokens === 'number')
    return t('settings.pages.flux.audit.tokenUsage', { prompt: metadata.promptTokens, completion: metadata.completionTokens })
  if (record.description?.startsWith('tts:') && 'model' in metadata && typeof metadata.model === 'string')
    return metadata.model
  return ''
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

// Group consecutive TTS debit records into collapsible rows
type GroupedRow = {
  type: 'single'
  record: DisplayRecord
} | {
  type: 'group'
  key: string
  description: string
  count: number
  totalAmount: number
  lastTime: string
  records: DisplayRecord[]
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
  let i = 0
  const records = auditRecords.value.map(record => ({ ...record, details: describeMetadata(record) }))

  while (i < records.length) {
    const record = records[i]
    if (record.type === 'debit' && record.description?.startsWith('tts:')) {
      const group: DisplayRecord[] = [record]
      while (i + 1 < records.length
        && records[i + 1].type === 'debit'
        && records[i + 1].description === record.description) {
        i++
        group.push(records[i])
      }

      if (group.length > 1) {
        rows.push({
          type: 'group',
          key: `tts-group-${record.id}`,
          description: record.description,
          count: group.length,
          totalAmount: group.reduce((sum, r) => sum + r.amount, 0),
          lastTime: group[0].createdAt,
          records: group,
        })
      }
      else {
        rows.push({ type: 'single', record })
      }
    }
    else {
      rows.push({ type: 'single', record })
    }
    i++
  }

  return rows
})

// Each session owns its requests and expanded rows. Teardown and account changes abort the old session before loading another.
watch(owner, (value, _previous, onCleanup) => {
  auditRecords.value = []
  auditOffset.value = 0
  auditHasMore.value = false
  auditLoading.value = false
  loadError.value = false
  expandedGroups.value.clear()
  if (!value)
    return
  const request = new AbortController()
  activeRequest = request
  onCleanup(() => {
    request.abort()
    if (activeRequest === request)
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

    <!-- Desktop: table -->
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
          <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
            <!-- Single record -->
            <tr
              v-if="row.type === 'single'"
              :class="['border-b border-neutral-100 dark:border-neutral-900/50 last:border-none']"
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
                <span>{{ row.record.description }}</span>
                <span
                  v-if="row.record.details"
                  :class="['ml-1 text-xs text-neutral-400']"
                >
                  ({{ row.record.details }})
                </span>
              </td>
              <td :class="['px-4 py-3 text-right font-mono']">
                <span :class="isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                  {{ displayAmount(row.record) }}
                </span>
              </td>
            </tr>

            <!-- Grouped TTS records -->
            <tr
              v-else
              :class="['border-b border-neutral-100 dark:border-neutral-900/50']"
            >
              <td :class="['whitespace-nowrap px-4 py-3 text-neutral-500']">
                {{ formatDate(row.lastTime) }}
              </td>
              <td :class="['px-4 py-3']">
                <span
                  :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                           'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
                >
                  {{ t('settings.pages.flux.audit.typeConsumption') }}
                </span>
              </td>
              <td :class="['px-4 py-3']">
                <GhostButton size="unset" :aria-expanded="expandedGroups.has(row.key)" @click="toggleGroup(row.key)">
                  <span
                    :class="['inline-block size-4 text-neutral-400', expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone']"
                  />
                  {{ row.description }}
                  <span :class="['ml-1 text-xs text-neutral-400']">
                    ({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})
                  </span>
                </GhostButton>
              </td>
              <td :class="['px-4 py-3 text-right font-mono']">
                <span :class="['text-orange-600 dark:text-orange-400']">
                  -{{ row.totalAmount }}
                </span>
              </td>
            </tr>

            <!-- Expanded group children -->
            <tr
              v-for="child in (row.type === 'group' && expandedGroups.has(row.key) ? row.records : [])"
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
                -{{ child.amount }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Mobile: card list -->
    <div v-if="auditRecords.length > 0" role="list" :class="['flex flex-col gap-2 sm:hidden']">
      <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
        <!-- Single record card -->
        <div
          v-if="row.type === 'single'"
          role="listitem"
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
            <span :class="['text-sm font-semibold font-mono', isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400']">
              {{ displayAmount(row.record) }}
            </span>
          </div>
          <div :class="['text-sm text-neutral-600 dark:text-neutral-300 truncate']">
            {{ row.record.description }}
            <span
              v-if="row.record.details"
              :class="['ml-1 text-xs text-neutral-400']"
            >
              ({{ row.record.details }})
            </span>
          </div>
          <div :class="['text-xs text-neutral-400']">
            {{ formatDate(row.record.createdAt) }}
          </div>
        </div>

        <!-- Grouped TTS card -->
        <div
          v-else
          role="listitem"
          :class="['border-1 border-neutral-100 dark:border-neutral-900 flex flex-col gap-1.5 rounded-lg px-3 py-2.5']"
        >
          <div :class="['flex items-center justify-between']">
            <span
              :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                       'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
            >
              {{ t('settings.pages.flux.audit.typeConsumption') }}
            </span>
            <span :class="['text-sm font-semibold font-mono text-orange-600 dark:text-orange-400']">
              -{{ row.totalAmount }}
            </span>
          </div>
          <GhostButton size="unset" :aria-expanded="expandedGroups.has(row.key)" :class="['justify-start! text-sm']" @click="toggleGroup(row.key)">
            <span
              :class="['inline-block size-4 text-neutral-400', expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone']"
            />
            {{ row.description }}
            <span :class="['text-xs text-neutral-400']">({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})</span>
          </GhostButton>
          <div :class="['text-xs text-neutral-400']">
            {{ formatDate(row.lastTime) }}
          </div>

          <!-- Expanded children -->
          <div v-if="row.type === 'group' && expandedGroups.has(row.key)" :class="['flex flex-col gap-1 mt-1 border-t border-neutral-100 dark:border-neutral-900 pt-2']">
            <div
              v-for="child in row.records"
              :key="child.id" :class="['flex items-center justify-between text-xs text-neutral-400']"
            >
              <span>{{ formatDate(child.createdAt) }}</span>
              <span :class="['font-mono']">-{{ child.amount }}</span>
            </div>
          </div>
        </div>
      </template>
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
