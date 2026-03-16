<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { useChatAlayaPlannerStore } from '@proj-airi/stage-ui/stores/chat/alaya-planner'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useMemoryShortTermRecordsStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term-records'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

type PlannerMemoryRecord = Awaited<
  ReturnType<ReturnType<typeof useMemoryShortTermRecordsStore>['loadWorkspaceRecords']>
>[number]

const { t } = useI18n()
const plannerStore = useChatAlayaPlannerStore()
const chatSessionStore = useChatSessionStore()
const memoryShortTermRecordsStore = useMemoryShortTermRecordsStore()

const { activeSessionId } = storeToRefs(chatSessionStore)
const { lastRunByWorkspace } = storeToRefs(plannerStore)
const {
  recordsByWorkspace,
  loadingByWorkspace,
  errorByWorkspace,
  deletingByEntryKey,
  clearingByWorkspace,
} = storeToRefs(memoryShortTermRecordsStore)

const activeWorkspaceId = computed(() => activeSessionId.value || '')
const currentWorkspaceRecords = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return []
  return recordsByWorkspace.value[workspaceId] ?? []
})
const currentWorkspaceLoading = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return false
  return loadingByWorkspace.value[workspaceId] ?? false
})
const currentWorkspaceError = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return null
  return errorByWorkspace.value[workspaceId] ?? null
})
const currentWorkspaceClearing = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return false
  return clearingByWorkspace.value[workspaceId] ?? false
})

function memoryEntryKey(record: PlannerMemoryRecord) {
  return memoryShortTermRecordsStore.entryKey(record.workspaceId, record.memoryId)
}

function formatTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0)
    return '-'
  return new Date(timestamp).toLocaleString()
}

function formatTags(tags: string[]) {
  if (!tags || tags.length === 0)
    return '-'
  return tags.join(', ')
}

function formatUnitValue(value: number | undefined) {
  if (!Number.isFinite(value))
    return '-'
  return Number(value).toFixed(2)
}

function formatEmotionSummary(record: PlannerMemoryRecord) {
  const emotion = record.metadata?.emotion
  if (!emotion)
    return '-'

  return [
    emotion.valence,
    ...emotion.labels.slice(0, 2),
    emotion.evidence,
  ].filter(Boolean).join(' | ')
}

function embeddingStatusClass(status: string | undefined) {
  if (status === 'ready')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (status === 'failed')
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
}

function embeddingStatusText(status: string | undefined) {
  if (status === 'ready')
    return t('settings.pages.memory.embedding.status.ready')
  if (status === 'failed')
    return t('settings.pages.memory.embedding.status.failed')
  if (status === 'pending' || !status)
    return t('settings.pages.memory.embedding.status.pending')
  return status
}

function embeddingVectorLength(record: PlannerMemoryRecord) {
  return record.embedding?.vector?.length ?? 0
}

function formatEmbeddingPreview(vector: number[] | undefined, maxValues = 10) {
  if (!vector || vector.length === 0)
    return '-'

  const head = vector
    .slice(0, maxValues)
    .map(value => Number.isFinite(value) ? value.toFixed(5) : 'NaN')
    .join(', ')

  return vector.length > maxValues
    ? `${head}, ...`
    : head
}

async function refreshCurrentWorkspaceRecords() {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return
  await memoryShortTermRecordsStore.loadWorkspaceRecords(workspaceId)
}

async function deleteMemoryRecord(record: PlannerMemoryRecord) {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return

  await memoryShortTermRecordsStore.deleteWorkspaceRecord(workspaceId, record.memoryId)
}

async function clearWorkspaceMemories() {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return

  const total = currentWorkspaceRecords.value.length
  if (total === 0)
    return

  await memoryShortTermRecordsStore.clearWorkspaceRecords(workspaceId)
}

watch(activeWorkspaceId, async (workspaceId) => {
  if (!workspaceId)
    return
  await memoryShortTermRecordsStore.loadWorkspaceRecords(workspaceId)
}, { immediate: true })

watch(
  () => {
    const workspaceId = activeWorkspaceId.value
    if (!workspaceId)
      return ''
    const lastRun = lastRunByWorkspace.value[workspaceId]
    return lastRun?.runId ?? ''
  },
  async (runId, prevRunId) => {
    if (!runId || runId === prevRunId)
      return
    await refreshCurrentWorkspaceRecords()
  },
)
</script>

<template>
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg text-neutral-600 md:text-2xl dark:text-neutral-300">
          {{ t('settings.pages.memory.title') }}
        </h2>
        <p class="text-sm text-neutral-400 dark:text-neutral-500">
          {{ t('settings.pages.memory.description') }}
        </p>
      </div>

      <RouterLink
        to="/settings/modules/memory-short-term"
        class="border border-primary-300 rounded px-3 py-1.5 text-sm text-primary-600 font-medium transition-colors dark:border-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/20"
      >
        {{ t('settings.pages.memory.actions.open_planner_settings') }}
      </RouterLink>
    </div>

    <div class="flex flex-col gap-3 rounded-lg bg-neutral-100 p-3 dark:bg-neutral-900/60">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h3 class="text-base text-neutral-600 font-medium dark:text-neutral-300">
            {{ t('settings.pages.memory.short_term_entries.title') }}
          </h3>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.pages.memory.short_term_entries.workspace', { workspace: activeWorkspaceId || t('settings.pages.memory.short_term_entries.no_active_workspace') }) }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="border border-neutral-300 rounded bg-white px-3 py-1.5 text-sm text-neutral-700 font-medium transition-colors disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 hover:bg-neutral-50 dark:text-neutral-200 disabled:opacity-60 dark:hover:bg-neutral-800"
            :disabled="!activeWorkspaceId || currentWorkspaceLoading"
            @click="refreshCurrentWorkspaceRecords"
          >
            {{ currentWorkspaceLoading ? t('settings.pages.memory.actions.loading') : t('settings.pages.memory.actions.refresh') }}
          </button>

          <button
            type="button"
            class="rounded bg-red-500 px-3 py-1.5 text-sm text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-red-300 hover:bg-red-600"
            :disabled="!activeWorkspaceId || currentWorkspaceClearing || currentWorkspaceRecords.length === 0"
            @click="clearWorkspaceMemories"
          >
            {{ currentWorkspaceClearing ? t('settings.pages.memory.actions.deleting') : t('settings.pages.memory.actions.delete_all') }}
          </button>
        </div>
      </div>

      <div
        v-if="!activeWorkspaceId"
        class="border border-neutral-300 rounded border-dashed px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
      >
        {{ t('settings.pages.memory.no_workspace_hint') }}
      </div>

      <div
        v-else-if="currentWorkspaceError"
        class="border border-red-200 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300"
      >
        {{ t('settings.pages.memory.errors.load_failed', { error: currentWorkspaceError }) }}
      </div>

      <Alert
        v-else-if="!currentWorkspaceLoading && currentWorkspaceRecords.length === 0"
        type="warning"
      >
        <template #title>
          {{ t('settings.pages.memory.empty.title') }}
        </template>
        <template #content>
          {{ t('settings.pages.memory.empty.content') }}
        </template>
      </Alert>

      <div v-else class="flex flex-col gap-3">
        <article
          v-for="record in currentWorkspaceRecords"
          :key="record.memoryId"
          class="flex flex-col gap-2 border border-neutral-200 rounded-lg bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="text-sm text-neutral-700 font-medium dark:text-neutral-200">
                {{ record.summary }}
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span class="rounded bg-neutral-200 px-2 py-0.5 dark:bg-neutral-800">
                  {{ record.category }}
                </span>
                <span class="rounded bg-neutral-200 px-2 py-0.5 dark:bg-neutral-800">
                  {{ record.retentionReason }}
                </span>
                <span>{{ t('settings.pages.memory.metrics.importance', { value: record.importance }) }}</span>
                <span>{{ t('settings.pages.memory.metrics.durability', { value: formatUnitValue(record.durability) }) }}</span>
                <span>{{ t('settings.pages.memory.metrics.emotion', { value: formatUnitValue(record.emotionIntensity) }) }}</span>
              </div>
            </div>

            <button
              type="button"
              class="rounded bg-red-500 px-2.5 py-1 text-xs text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-red-300 hover:bg-red-600"
              :disabled="deletingByEntryKey[memoryEntryKey(record)]"
              @click="deleteMemoryRecord(record)"
            >
              {{ deletingByEntryKey[memoryEntryKey(record)] ? t('settings.pages.memory.actions.deleting') : t('settings.pages.memory.actions.delete') }}
            </button>
          </div>

          <div class="flex flex-col gap-2 border border-neutral-200 rounded bg-neutral-50 p-2.5 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs text-neutral-500 dark:text-neutral-400">
                {{ t('settings.pages.memory.embedding.title') }}
              </div>
              <span
                class="rounded px-2 py-0.5 text-xs font-medium"
                :class="embeddingStatusClass(record.embedding?.status)"
              >
                {{ embeddingStatusText(record.embedding?.status) }}
              </span>
            </div>

            <div class="grid gap-1 text-xs text-neutral-500 md:grid-cols-2 dark:text-neutral-400">
              <span>{{ t('settings.pages.memory.embedding.model', { value: record.embedding?.model || '-' }) }}</span>
              <span>{{ t('settings.pages.memory.embedding.dimension', { value: record.embedding?.dimension ?? '-' }) }}</span>
              <span>{{ t('settings.pages.memory.embedding.vector_length', { value: embeddingVectorLength(record) || '-' }) }}</span>
              <span>{{ t('settings.pages.memory.embedding.generated', { value: formatTimestamp(record.embedding?.generatedAt ?? 0) }) }}</span>
            </div>

            <div
              v-if="record.embedding?.status === 'failed' && record.embedding?.failureReason"
              class="border border-red-200 rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300"
            >
              {{ t('settings.pages.memory.embedding.failure', { value: record.embedding.failureReason }) }}
            </div>

            <details
              v-if="embeddingVectorLength(record) > 0"
              class="text-xs text-neutral-600 dark:text-neutral-300"
            >
              <summary class="cursor-pointer select-none text-neutral-500 dark:text-neutral-400">
                {{ t('settings.pages.memory.embedding.vector_preview', { count: 10 }) }}
              </summary>
              <pre class="mt-1 overflow-auto rounded bg-neutral-100 p-2 text-[11px] leading-4 dark:bg-neutral-900/80">{{ formatEmbeddingPreview(record.embedding?.vector) }}</pre>
            </details>
          </div>

          <div class="grid gap-1 text-xs text-neutral-500 md:grid-cols-2 dark:text-neutral-400">
            <span>{{ t('settings.pages.memory.meta.tags', { value: formatTags(record.tags) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.retention_reason', { value: record.retentionReason }) }}</span>
            <span>{{ t('settings.pages.memory.meta.status', { value: record.retention.status }) }}</span>
            <span>{{ t('settings.pages.memory.meta.emotion', { value: formatEmotionSummary(record) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.created', { value: formatTimestamp(record.createdAt) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.updated', { value: formatTimestamp(record.updatedAt) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.event_at', { value: formatTimestamp(record.eventAt) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.last_accessed', { value: formatTimestamp(record.lastAccessedAt) }) }}</span>
            <span>{{ t('settings.pages.memory.meta.access_count', { value: record.accessCount }) }}</span>
            <span>{{ t('settings.pages.memory.meta.half_life', { value: record.decay.halfLifeDays }) }}</span>
            <span>{{ t('settings.pages.memory.meta.reinforced', { value: record.decay.reinforcedCount }) }}</span>
            <span>{{ t('settings.pages.memory.meta.source_refs', { value: record.sourceRefs.length }) }}</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
