<script setup lang="ts">
import { Alert } from '@proj-airi/stage-ui/components'
import { useChatAlayaPlannerStore } from '@proj-airi/stage-ui/stores/chat/alaya-planner'
import { useChatAlayaQueryStore } from '@proj-airi/stage-ui/stores/chat/alaya-query'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useMemoryShortTermStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term'
import { useMemoryShortTermRecordsStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term-records'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

const plannerStore = useChatAlayaPlannerStore()
const queryStore = useChatAlayaQueryStore()
const chatSessionStore = useChatSessionStore()
const memoryShortTermStore = useMemoryShortTermStore()
const recordsStore = useMemoryShortTermRecordsStore()

const {
  running,
  runHistory,
  lastRunByWorkspace,
  scheduledRoundCountByWorkspace,
} = storeToRefs(plannerStore)
const { running: queryRunning, runHistory: queryRunHistory } = storeToRefs(queryStore)
const { activeSessionId } = storeToRefs(chatSessionStore)
const {
  plannerSystemPrompt,
  normalizedPlannerSystemPrompt,
  normalizedPlannerRoundThreshold,
} = storeToRefs(memoryShortTermStore)
const { recordsByWorkspace, loadingByWorkspace, errorByWorkspace } = storeToRefs(recordsStore)

const showOnlyActiveWorkspace = ref(true)

const activeWorkspaceId = computed(() => activeSessionId.value || '')
const activeWorkspacePendingRounds = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return 0
  return scheduledRoundCountByWorkspace.value[workspaceId] ?? 0
})
const activeWorkspaceRecords = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return []
  return recordsByWorkspace.value[workspaceId] ?? []
})
const activeWorkspaceLoading = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return false
  return loadingByWorkspace.value[workspaceId] ?? false
})
const activeWorkspaceError = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return null
  return errorByWorkspace.value[workspaceId] ?? null
})
const activeLastRun = computed(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return undefined
  return lastRunByWorkspace.value[workspaceId]
})

const displayedHistory = computed(() => {
  if (!showOnlyActiveWorkspace.value || !activeWorkspaceId.value)
    return runHistory.value
  return runHistory.value.filter(item => item.workspaceId === activeWorkspaceId.value)
})
const displayedQueryHistory = computed(() => {
  if (!showOnlyActiveWorkspace.value || !activeWorkspaceId.value)
    return queryRunHistory.value
  return queryRunHistory.value.filter(item => item.workspaceId === activeWorkspaceId.value)
})

function formatTimestamp(timestamp?: number) {
  if (!timestamp)
    return '-'
  return new Date(timestamp).toLocaleString()
}

function formatDuration(start?: number, end?: number) {
  if (!start || !end)
    return '-'
  return `${Math.max(0, end - start)} ms`
}

function statusTagClass(status: 'skipped_threshold' | 'completed' | 'failed') {
  if (status === 'completed')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (status === 'failed')
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
}
function queryStatusTagClass(status: 'skipped' | 'completed' | 'failed') {
  if (status === 'completed')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
  if (status === 'failed')
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
}

async function refreshActiveWorkspaceRecords() {
  if (!activeWorkspaceId.value)
    return
  await recordsStore.loadWorkspaceRecords(activeWorkspaceId.value)
}

async function runPlannerNow() {
  await plannerStore.runForActiveSession('manual')
  await refreshActiveWorkspaceRecords()
}

function clearLogs() {
  plannerStore.clearRunHistory()
}

function clearQueryLogs() {
  queryStore.clearRunHistory()
}

function resetPlannerSystemPrompt() {
  memoryShortTermStore.resetPlannerSystemPrompt()
}

watch(activeWorkspaceId, async (workspaceId) => {
  if (!workspaceId)
    return
  await recordsStore.loadWorkspaceRecords(workspaceId)
}, { immediate: true })
</script>

<template>
  <div class="h-full min-h-0 flex flex-col gap-4 overflow-y-auto p-4">
    <div class="flex flex-col gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg text-neutral-700 font-semibold dark:text-neutral-200">
            Memory Alaya Planner Logs
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Inspect planner triggers, run result, and short-term memory write outcomes.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="border border-neutral-300 rounded bg-white px-3 py-1.5 text-sm text-neutral-700 font-medium transition-colors disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 hover:bg-neutral-50 dark:text-neutral-200 disabled:opacity-60 dark:hover:bg-neutral-800"
            :disabled="running || !activeWorkspaceId"
            @click="runPlannerNow"
          >
            {{ running ? 'Running...' : 'Run Planner Now' }}
          </button>
          <button
            type="button"
            class="border border-neutral-300 rounded bg-white px-3 py-1.5 text-sm text-neutral-700 font-medium transition-colors disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-900 hover:bg-neutral-50 dark:text-neutral-200 disabled:opacity-60 dark:hover:bg-neutral-800"
            :disabled="!activeWorkspaceId || activeWorkspaceLoading"
            @click="refreshActiveWorkspaceRecords"
          >
            {{ activeWorkspaceLoading ? 'Loading...' : 'Refresh Memory Count' }}
          </button>
          <button
            type="button"
            class="rounded bg-red-500 px-3 py-1.5 text-sm text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-red-300 hover:bg-red-600"
            :disabled="runHistory.length === 0"
            @click="clearLogs"
          >
            Clear Planner Logs
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2 md:grid-cols-4">
        <div class="rounded-lg bg-white px-3 py-2 dark:bg-neutral-900/60">
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            Active Workspace
          </div>
          <div class="mt-1 break-all text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ activeWorkspaceId || 'No active session' }}
          </div>
        </div>

        <div class="rounded-lg bg-white px-3 py-2 dark:bg-neutral-900/60">
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            Pending / Threshold
          </div>
          <div class="mt-1 text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ activeWorkspacePendingRounds }} / {{ normalizedPlannerRoundThreshold }}
          </div>
        </div>

        <div class="rounded-lg bg-white px-3 py-2 dark:bg-neutral-900/60">
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            Short-Term Entries
          </div>
          <div class="mt-1 text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ activeWorkspaceRecords.length }}
          </div>
        </div>

        <div class="rounded-lg bg-white px-3 py-2 dark:bg-neutral-900/60">
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            Last Run
          </div>
          <div class="mt-1 text-sm text-neutral-700 font-medium dark:text-neutral-200">
            {{ activeLastRun?.runId || '-' }}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 rounded-lg bg-white p-3 dark:bg-neutral-900/60">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-sm text-neutral-600 font-medium dark:text-neutral-200">
            Planner System Prompt (Developer)
          </div>
          <button
            type="button"
            class="border border-neutral-300 rounded bg-white px-3 py-1 text-xs text-neutral-700 font-medium transition-colors dark:border-neutral-700 dark:bg-neutral-900 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
            @click="resetPlannerSystemPrompt"
          >
            Reset Default Prompt
          </button>
        </div>

        <textarea
          v-model="plannerSystemPrompt"
          rows="10"
          class="w-full border border-neutral-300 rounded bg-white px-3 py-2 text-xs leading-5 font-mono dark:border-neutral-700 dark:bg-neutral-950"
          spellcheck="false"
        />
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          Prompt is saved locally and applied on next planner run. Current normalized length: {{ normalizedPlannerSystemPrompt.length }} chars.
        </div>
      </div>

      <div class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
        <input
          id="show-only-active-workspace"
          v-model="showOnlyActiveWorkspace"
          type="checkbox"
          class="h-4 w-4"
        >
        <label for="show-only-active-workspace">
          Show only active workspace logs
        </label>
      </div>

      <div
        v-if="activeWorkspaceError"
        class="border border-red-200 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300"
      >
        Failed to load short-term memory count: {{ activeWorkspaceError }}
      </div>
    </div>

    <div class="max-h-[55vh] min-h-60 overflow-y-auto rounded-xl bg-white/70 p-3 dark:bg-neutral-950/50">
      <Alert
        v-if="displayedHistory.length === 0"
        type="warning"
      >
        <template #title>
          No planner logs yet
        </template>
        <template #content>
          Send chat messages until planner is triggered, or click "Run Planner Now" above.
        </template>
      </Alert>

      <div v-else class="flex flex-col gap-3">
        <article
          v-for="item in displayedHistory"
          :key="item.id"
          class="border border-neutral-200 rounded-lg bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded px-2 py-0.5 text-xs font-medium" :class="statusTagClass(item.status)">
                {{ item.status }}
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                trigger: {{ item.trigger }}
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                at: {{ formatTimestamp(item.timestamp) }}
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                duration: {{ formatDuration(item.timestamp, item.finishedAt) }}
              </span>
            </div>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              runId: {{ item.runId || '-' }}
            </span>
          </div>

          <div class="grid mt-2 gap-1 text-xs text-neutral-600 md:grid-cols-2 dark:text-neutral-300">
            <span>workspace: {{ item.workspaceId }}</span>
            <span>session: {{ item.sessionId }}</span>
            <span>round: {{ item.roundCount ?? '-' }} / {{ item.roundThreshold ?? '-' }}</span>
            <span>reason: {{ item.reason || '-' }}</span>
            <span>turns: {{ item.processedTurns ?? '-' }}</span>
            <span>candidates: {{ item.producedCandidates ?? '-' }} (dropped {{ item.droppedCandidates ?? '-' }})</span>
            <span>embeddings generated: {{ item.metrics?.embeddingCount ?? '-' }}</span>
            <span>llm tokens: prompt {{ item.metrics?.llmPromptTokens ?? '-' }}, completion {{ item.metrics?.llmCompletionTokens ?? '-' }}</span>
            <span>write: inserted {{ item.writeResult?.inserted ?? '-' }}, merged {{ item.writeResult?.merged ?? '-' }}, skipped {{ item.writeResult?.skipped ?? '-' }}</span>
            <span>error count: {{ item.errors?.length ?? 0 }}</span>
            <span>llm runtime enabled: {{ item.runtime.enabled ? 'yes' : 'no' }}</span>
            <span>llm provider/model: {{ item.runtime.providerId || '-' }} / {{ item.runtime.model || '-' }}</span>
            <span>llm baseURL configured: {{ item.runtime.baseURLConfigured ? 'yes' : 'no' }}</span>
            <span>llm apiKey configured: {{ item.runtime.apiKeyConfigured ? 'yes' : 'no' }}</span>
            <span>llm timeout: {{ item.runtime.llmTimeoutMs ?? '-' }} ms</span>
            <span>llm mode: {{ item.runtime.llmMode || '-' }}</span>
            <span>fallback reason: {{ item.runtime.fallbackReason || '-' }}</span>
            <span>system prompt chars: {{ item.runtime.systemPromptChars ?? '-' }}</span>
            <span>embedding enabled: {{ item.runtime.embeddingEnabled ? 'yes' : 'no' }}</span>
            <span>embedding provider/model: {{ item.runtime.embeddingProviderId || '-' }} / {{ item.runtime.embeddingModel || '-' }}</span>
            <span>embedding baseURL configured: {{ item.runtime.embeddingBaseURLConfigured ? 'yes' : 'no' }}</span>
            <span>embedding apiKey configured: {{ item.runtime.embeddingApiKeyConfigured ? 'yes' : 'no' }}</span>
            <span>embedding timeout/batch: {{ item.runtime.embeddingTimeoutMs ?? '-' }} ms / {{ item.runtime.embeddingBatchSize ?? '-' }}</span>
            <span>embedding mode: {{ item.runtime.embeddingMode || '-' }}</span>
          </div>

          <details
            v-if="item.errors && item.errors.length > 0"
            class="mt-2 text-xs"
          >
            <summary class="cursor-pointer select-none text-red-600 dark:text-red-300">
              Show errors ({{ item.errors.length }})
            </summary>
            <pre class="mt-1 overflow-auto rounded bg-red-50 p-2 text-red-700 dark:bg-red-900/20 dark:text-red-200">{{ JSON.stringify(item.errors, null, 2) }}</pre>
          </details>
        </article>
      </div>
    </div>

    <div class="max-h-[55vh] min-h-60 overflow-y-auto rounded-xl bg-white/70 p-3 dark:bg-neutral-950/50">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
          Query Engine Logs
        </div>
        <button
          type="button"
          class="rounded bg-red-500 px-3 py-1.5 text-xs text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-red-300 hover:bg-red-600"
          :disabled="queryRunHistory.length === 0 || queryRunning"
          @click="clearQueryLogs"
        >
          Clear Query Logs
        </button>
      </div>

      <Alert
        v-if="displayedQueryHistory.length === 0"
        type="warning"
      >
        <template #title>
          No query logs yet
        </template>
        <template #content>
          Send chat messages to trigger pre-send recall query runs.
        </template>
      </Alert>

      <div v-else class="flex flex-col gap-3">
        <article
          v-for="item in displayedQueryHistory"
          :key="item.id"
          class="border border-neutral-200 rounded-lg bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900/60"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded px-2 py-0.5 text-xs font-medium" :class="queryStatusTagClass(item.status)">
                {{ item.status }}
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                at: {{ formatTimestamp(item.timestamp) }}
              </span>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">
                duration: {{ formatDuration(item.timestamp, item.finishedAt) }}
              </span>
            </div>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              workspace: {{ item.workspaceId }}
            </span>
          </div>

          <div class="mt-2 rounded bg-neutral-50 p-2 text-xs text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
            query: {{ item.queryText }}
          </div>

          <div class="grid mt-2 gap-1 text-xs text-neutral-600 md:grid-cols-2 dark:text-neutral-300">
            <span>session: {{ item.sessionId }}</span>
            <span>reason: {{ item.reason || '-' }}</span>
            <span>query chars: {{ item.queryChars }}</span>
            <span>context chars/tokens: {{ item.contextChars ?? '-' }} / {{ item.contextTokens ?? '-' }}</span>
            <span>scanned/selected: {{ item.metrics?.scannedRecords ?? '-' }} / {{ item.metrics?.selectedRecords ?? '-' }}</span>
            <span>threshold rejected: {{ item.metrics?.thresholdRejectedRecords ?? '-' }}</span>
            <span>access updated: {{ item.metrics?.accessUpdatedRecords ?? '-' }}</span>
            <span>selected memoryIds: {{ item.selectedMemoryIds?.length ? item.selectedMemoryIds.join(', ') : '-' }}</span>
            <span>vector/keyword scored: {{ item.metrics?.vectorScoredRecords ?? '-' }} / {{ item.metrics?.keywordScoredRecords ?? '-' }}</span>
            <span>query embedding generated: {{ item.metrics?.queryEmbeddingGenerated ? 'yes' : 'no' }}</span>
            <span>query embedding model/dim: {{ item.metrics?.queryEmbeddingModel ?? '-' }} / {{ item.metrics?.queryEmbeddingDimension ?? '-' }}</span>
            <span>embedding runtime enabled: {{ item.runtime.embeddingEnabled ? 'yes' : 'no' }}</span>
            <span>embedding provider/model: {{ item.runtime.embeddingProviderId || '-' }} / {{ item.runtime.embeddingModel || '-' }}</span>
            <span>embedding baseURL configured: {{ item.runtime.embeddingBaseURLConfigured ? 'yes' : 'no' }}</span>
            <span>embedding apiKey configured: {{ item.runtime.embeddingApiKeyConfigured ? 'yes' : 'no' }}</span>
            <span>embedding timeout/batch: {{ item.runtime.embeddingTimeoutMs ?? '-' }} ms / {{ item.runtime.embeddingBatchSize ?? '-' }}</span>
            <span>error count: {{ item.errors?.length ?? 0 }}</span>
          </div>

          <details
            v-if="item.injectedContextPreview"
            class="mt-2 text-xs"
          >
            <summary class="cursor-pointer select-none text-neutral-700 dark:text-neutral-200">
              Show injected context preview ({{ item.injectedContextPreview.length }} chars)
            </summary>
            <pre class="mt-1 overflow-auto rounded bg-neutral-100 p-2 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">{{ item.injectedContextPreview }}</pre>
          </details>

          <details
            v-if="item.errors && item.errors.length > 0"
            class="mt-2 text-xs"
          >
            <summary class="cursor-pointer select-none text-red-600 dark:text-red-300">
              Show errors ({{ item.errors.length }})
            </summary>
            <pre class="mt-1 overflow-auto rounded bg-red-50 p-2 text-red-700 dark:bg-red-900/20 dark:text-red-200">{{ JSON.stringify(item.errors, null, 2) }}</pre>
          </details>
        </article>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Memory Alaya
  subtitleKey: tamagotchi.settings.devtools.title
</route>
