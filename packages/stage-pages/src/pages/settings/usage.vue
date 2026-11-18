<script setup lang="ts">
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, Table, TableCell, TableHead } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated } = storeToRefs(authStore)

interface AuditRecord {
  id: string
  type: string
  amount: number
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' ? -record.amount : record.amount
  const formatted = formatNumber(Math.abs(signed))
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
  auditLoading.value = true
  try {
    const offset = loadMore ? auditOffset.value : 0
    const res = await client.api.v1.flux.history.$get({
      query: { limit: String(AUDIT_PAGE_SIZE), offset: String(offset) },
    })
    if (res.ok) {
      const data = await res.json() as { records: AuditRecord[], hasMore: boolean }
      if (loadMore) {
        auditRecords.value.push(...data.records)
      }
      else {
        auditRecords.value = data.records
      }
      auditHasMore.value = data.hasMore
      auditOffset.value = offset + data.records.length
    }
  }
  catch {
    return
  }
  finally {
    auditLoading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

type GroupedRow = {
  type: 'single'
  record: AuditRecord
} | {
  type: 'group'
  key: string
  description: string
  model: string
  count: number
  totalAmount: number
  firstTime: string
  lastTime: string
  records: AuditRecord[]
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
  const records = auditRecords.value

  while (i < records.length) {
    const record = records[i]
    if (record.type === 'debit' && record.description?.startsWith('tts:')) {
      const group: AuditRecord[] = [record]
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
          model: (record.metadata?.model as string) || '',
          count: group.length,
          totalAmount: group.reduce((sum, r) => sum + r.amount, 0),
          firstTime: group.at(-1)!.createdAt,
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

watch(isAuthenticated, (authenticated) => {
  if (!authenticated) {
    auditRecords.value = []
    auditHasMore.value = false
    auditOffset.value = 0
    return
  }

  void fetchAuditHistory()
}, { immediate: true })
</script>

<template>
  <div :class="['flex min-h-full flex-col gap-4 p-4']">
    <RouterLink to="/settings/flux" :class="['self-end text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400']">
      {{ t('settings.pages.flux.pageTitle') }}
    </RouterLink>
    <div v-if="!isAuthenticated" :class="['flex flex-col items-center gap-3 py-8 text-sm text-neutral-500 dark:text-neutral-400']">
      <p>{{ t('settings.pages.usage.signIn') }}</p>
      <Button :label="t('settings.pages.usage.signInAction')" @click="authStore.requestLogin()" />
    </div>

    <div v-if="isAuthenticated" data-testid="flux-history" flex="~ col gap-3">
      <div flex="~ col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
        <h3 text-lg font-semibold>
          {{ t('settings.pages.flux.audit.title') }}
        </h3>
        <span text="xs neutral-400">
          {{ t('settings.pages.flux.audit.delayHint') }}
        </span>
      </div>

      <div v-if="auditLoading && auditRecords.length === 0" text="sm neutral-500" py-4 text-center>
        {{ t('settings.pages.flux.audit.loading') }}
      </div>

      <div v-else-if="auditRecords.length === 0" text="sm neutral-500" py-4 text-center>
        {{ t('settings.pages.flux.audit.empty') }}
      </div>

      <Table v-else container-class="hidden sm:block">
        <template #header>
          <tr>
            <TableHead>{{ t('settings.pages.flux.audit.time') }}</TableHead>
            <TableHead>{{ t('settings.pages.flux.audit.type') }}</TableHead>
            <TableHead>{{ t('settings.pages.flux.audit.detail') }}</TableHead>
            <TableHead align="right">
              {{ t('settings.pages.flux.audit.amount') }}
            </TableHead>
          </tr>
        </template>

        <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
          <tr v-if="row.type === 'single'">
            <TableCell :class="['whitespace-nowrap text-neutral-500']">
              {{ formatDate(row.record.createdAt) }}
            </TableCell>
            <TableCell>
              <span
                inline-block rounded-full px-2 py-0.5 text-xs font-medium
                :class="row.record.type === 'debit'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400'"
              >
                {{ typeLabel(row.record.type) }}
              </span>
            </TableCell>
            <TableCell>
              <span>{{ row.record.description }}</span>
              <span
                v-if="row.record.metadata?.promptTokens != null"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.promptTokens }}+{{ row.record.metadata.completionTokens }} tokens)
              </span>
              <span
                v-else-if="row.record.description?.startsWith('tts:') && row.record.metadata?.model"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.model }})
              </span>
            </TableCell>
            <TableCell align="right" :class="['font-mono']">
              <span :class="isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ displayAmount(row.record) }}
              </span>
            </TableCell>
          </tr>

          <tr
            v-else
            :class="['cursor-pointer', 'hover:bg-neutral-50', 'dark:hover:bg-neutral-800/30']"
            @click="toggleGroup(row.key)"
          >
            <TableCell :class="['whitespace-nowrap text-neutral-500']">
              {{ formatDate(row.lastTime) }}
            </TableCell>
            <TableCell>
              <span
                :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                         'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
              >
                {{ t('settings.pages.flux.audit.typeConsumption') }}
              </span>
            </TableCell>
            <TableCell>
              <span flex="~ items-center gap-1">
                <span
                  :class="expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone'"
                  inline-block size-4 text="neutral-400"
                />
                {{ row.description }}
                <span ml-1 text="xs neutral-400">
                  ({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})
                </span>
              </span>
            </TableCell>
            <TableCell align="right" :class="['font-mono']">
              <span text="orange-600 dark:orange-400">
                -{{ row.totalAmount }}
              </span>
            </TableCell>
          </tr>

          <tr
            v-for="child in (row.type === 'group' && expandedGroups.has(row.key) ? row.records : [])"
            :key="child.id"
            :class="['bg-neutral-50/50 dark:bg-neutral-800/20']"
          >
            <TableCell compact :class="['whitespace-nowrap pl-8 text-xs text-neutral-400']">
              {{ formatDate(child.createdAt) }}
            </TableCell>
            <TableCell compact />
            <TableCell compact :class="['text-xs text-neutral-400']">
              {{ child.description }}
            </TableCell>
            <TableCell compact align="right" :class="['font-mono text-xs text-orange-500 dark:text-orange-400']">
              -{{ child.amount }}
            </TableCell>
          </tr>
        </template>
      </Table>

      <div v-if="auditRecords.length > 0" flex="~ col gap-2" sm:hidden>
        <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
          <div
            v-if="row.type === 'single'"
            border="1 neutral-200 dark:neutral-800" flex="~ col gap-1.5" rounded-lg px-3 py-2.5
          >
            <div flex="~ items-center justify-between">
              <span
                inline-block rounded-full px-2 py-0.5 text-xs font-medium
                :class="row.record.type === 'debit'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400'"
              >
                {{ typeLabel(row.record.type) }}
              </span>
              <span text-sm font-semibold font-mono :class="isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ displayAmount(row.record) }}
              </span>
            </div>
            <div text="sm neutral-600 dark:neutral-300" truncate>
              {{ row.record.description }}
              <span
                v-if="row.record.metadata?.promptTokens != null"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.promptTokens }}+{{ row.record.metadata.completionTokens }} tokens)
              </span>
              <span
                v-else-if="row.record.description?.startsWith('tts:') && row.record.metadata?.model"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.model }})
              </span>
            </div>
            <div text="xs neutral-400">
              {{ formatDate(row.record.createdAt) }}
            </div>
          </div>

          <div
            v-else
            border="1 neutral-200 dark:neutral-800" flex="~ col gap-1.5" cursor-pointer rounded-lg px-3 py-2.5
            @click="toggleGroup(row.key)"
          >
            <div flex="~ items-center justify-between">
              <span
                :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                         'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
              >
                {{ t('settings.pages.flux.audit.typeConsumption') }}
              </span>
              <span text-sm font-semibold font-mono text="orange-600 dark:orange-400">
                -{{ row.totalAmount }}
              </span>
            </div>
            <div flex="~ items-center gap-1" text="sm neutral-600 dark:neutral-300">
              <span
                :class="expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone'"
                inline-block size-4 text="neutral-400"
              />
              {{ row.description }}
              <span text="xs neutral-400">({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})</span>
            </div>
            <div text="xs neutral-400">
              {{ formatDate(row.lastTime) }}
            </div>

            <div v-if="row.type === 'group' && expandedGroups.has(row.key)" flex="~ col gap-1" mt-1 border="t neutral-200 dark:neutral-700" pt-2>
              <div
                v-for="child in row.records" :key="child.id"
                flex="~ items-center justify-between" text="xs neutral-400"
              >
                <span>{{ formatDate(child.createdAt) }}</span>
                <span font-mono>-{{ child.amount }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="auditHasMore" text-center>
        <Button
          :label="t('settings.pages.flux.audit.loadMore')"
          :loading="auditLoading"
          @click="fetchAuditHistory(true)"
        />
      </div>
    </div>
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
