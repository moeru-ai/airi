import type { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import type { Message } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { formatContextPromptText } from '../chat/context-prompt'

export type ContextLifecyclePhase
  = | 'after-compose'
    | 'before-compose'
    | 'broadcast-posted'
    | 'broadcast-received'
    | 'input-context-update'
    | 'prompt-context-built'
    | 'server-received'
    | 'store-ingest-rejected'
    | 'store-ingested'

export interface ContextLifecycleRecord {
  channel: 'broadcast' | 'chat' | 'input' | 'server'
  contextId?: string
  details?: unknown
  eventId?: string
  id: string
  lane?: string
  mutation?: 'append' | 'replace'
  phase: ContextLifecyclePhase
  sessionId?: string
  sourceKey?: string
  sourceLabel?: string
  strategy?: ContextUpdateStrategy
  textPreview?: string
  timestamp: number
}

export interface PromptProjectionSnapshot {
  capturedAt: number
  composedMessage?: Message[]
  contexts: Record<string, ContextMessage[]>
  message: string
  promptMessage?: Message
  promptText: string
  sessionId: string
}

const DEFAULT_MAX_HISTORY = 200

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

function truncateText(value: string, limit = 220) {
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}...`
}

export const useContextObservabilityStore = defineStore('devtools:context-observability', () => {
  const history = ref<ContextLifecycleRecord[]>([])
  const maxHistory = ref(DEFAULT_MAX_HISTORY)
  const lastPromptProjection = ref<PromptProjectionSnapshot>()
  const lastBroadcastPostedAt = ref<number>()
  const lastBroadcastReceivedAt = ref<number>()

  function recordLifecycle(record: Omit<ContextLifecycleRecord, 'id' | 'textPreview' | 'timestamp'> & { textPreview?: string }) {
    const nextRecord: ContextLifecycleRecord = {
      id: nanoid(),
      timestamp: Date.now(),
      ...record,
      details: record.details === undefined ? undefined : cloneValue(record.details),
      textPreview: record.textPreview ? truncateText(record.textPreview) : undefined,
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

  function capturePromptProjection(payload: {
    composedMessage?: Message[]
    contexts: Record<string, ContextMessage[]>
    message: string
    promptMessage?: Message | null
    sessionId: string
  }) {
    lastPromptProjection.value = {
      capturedAt: Date.now(),
      composedMessage: payload.composedMessage ? cloneValue(payload.composedMessage) : undefined,
      contexts: cloneValue(payload.contexts),
      message: payload.message,
      promptMessage: payload.promptMessage ? cloneValue(payload.promptMessage) : undefined,
      promptText: formatContextPromptText(payload.contexts),
      sessionId: payload.sessionId,
    }
  }

  function clearHistory() {
    history.value = []
  }

  return {
    capturePromptProjection,
    clearHistory,
    history,
    lastBroadcastPostedAt,
    lastBroadcastReceivedAt,
    lastPromptProjection,
    maxHistory,
    recordLifecycle,
  }
})
