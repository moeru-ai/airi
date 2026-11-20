import type { ContextUpdateStrategy } from '@proj-airi/server-sdk'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useContextPromptProjectionStore } from './context-prompt-projection'

export type {
  ContextProjectionGroup,
  ContextProjectionGroupKind,
  ContextProjectionSectionKind,
  SerializedProjectionBreakdown,
} from './context-projection'
export { groupProjectionSections, reportedWindowUsage } from './context-projection'
export type {
  PromptProjectionRequest,
  PromptProjectionSnapshot,
  ProviderProjectionCapture,
  ReportedPromptUsage,
} from './context-prompt-projection'
export { useContextPromptProjectionStore } from './context-prompt-projection'

export type ContextLifecyclePhase
  = | 'server-received'
    | 'input-context-update'
    | 'broadcast-posted'
    | 'broadcast-received'
    | 'store-ingested'
    | 'store-ingest-rejected'
    | 'before-compose'
    | 'prompt-context-built'
    | 'after-compose'

export interface ContextLifecycleRecord {
  id: string
  timestamp: number
  phase: ContextLifecyclePhase
  channel: 'server' | 'broadcast' | 'chat' | 'input'
  sourceKey?: string
  sessionId?: string
  strategy?: ContextUpdateStrategy
  lane?: string
  contextId?: string
  eventId?: string
  mutation?: 'replace' | 'append'
  textPreview?: string
  sourceLabel?: string
  details?: unknown
}

const DEFAULT_MAX_HISTORY = 200

function truncateText(value: string, limit = 220) {
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}...`
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/**
 * Local context lifecycle history for this window.
 *
 * Prompt projection lives in {@link useContextPromptProjectionStore}, which is
 * replicated to follower chat windows. Lifecycle history stays local.
 */
export const useContextObservabilityStore = defineStore('devtools:context-observability', () => {
  const promptProjection = useContextPromptProjectionStore()
  const history = ref<ContextLifecycleRecord[]>([])
  const maxHistory = ref(DEFAULT_MAX_HISTORY)
  const lastBroadcastPostedAt = ref<number>()
  const lastBroadcastReceivedAt = ref<number>()
  const lastPromptProjection = computed(() => promptProjection.lastPromptProjection)

  function recordLifecycle(record: Omit<ContextLifecycleRecord, 'id' | 'timestamp' | 'textPreview'> & { textPreview?: string }) {
    const nextRecord: ContextLifecycleRecord = {
      id: nanoid(),
      timestamp: Date.now(),
      ...record,
      textPreview: record.textPreview ? truncateText(record.textPreview) : undefined,
      details: record.details === undefined ? undefined : cloneValue(record.details),
    }

    history.value.unshift(nextRecord)
    if (history.value.length > maxHistory.value) {
      history.value.splice(maxHistory.value)
    }

    if (record.phase === 'broadcast-posted')
      lastBroadcastPostedAt.value = nextRecord.timestamp
    if (record.phase === 'broadcast-received')
      lastBroadcastReceivedAt.value = nextRecord.timestamp

    return nextRecord
  }

  function capturePromptProjection(...args: Parameters<typeof promptProjection.capturePromptProjection>) {
    return promptProjection.capturePromptProjection(...args)
  }

  function captureProviderPromptProjection(...args: Parameters<typeof promptProjection.captureProviderPromptProjection>) {
    return promptProjection.captureProviderPromptProjection(...args)
  }

  function recordReportedUsage(...args: Parameters<typeof promptProjection.recordReportedUsage>) {
    return promptProjection.recordReportedUsage(...args)
  }

  function clearHistory() {
    history.value = []
  }

  return {
    history,
    maxHistory,
    lastPromptProjection,
    lastBroadcastPostedAt,
    lastBroadcastReceivedAt,
    recordLifecycle,
    capturePromptProjection,
    captureProviderPromptProjection,
    recordReportedUsage,
    clearHistory,
  }
})
