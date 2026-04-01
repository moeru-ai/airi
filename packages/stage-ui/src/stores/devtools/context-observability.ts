import type { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import type { Message } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { formatContextPromptText } from '../chat/context-prompt'

export type ContextLifecyclePhase
  = | 'server-received'
    | 'input-context-update'
    | 'broadcast-posted'
    | 'broadcast-received'
    | 'store-ingested'
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

export interface PromptProjectionSnapshot {
  capturedAt: number
  sessionId: string
  message: string
  contexts: Record<string, ContextMessage[]>
  promptText: string
  promptMessage?: Message
  composedMessage?: Message[]
}

const DEFAULT_MAX_HISTORY = 200

function truncateText(value: string, limit = 220) {
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}...`
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useContextObservabilityStore = defineStore('devtools:context-observability', () => {
  const history = ref<ContextLifecycleRecord[]>([])
  const maxHistory = ref(DEFAULT_MAX_HISTORY)
  const lastPromptProjection = ref<PromptProjectionSnapshot>()
  const lastBroadcastPostedAt = ref<number>()
  const lastBroadcastReceivedAt = ref<number>()

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

  function capturePromptProjection(payload: {
    sessionId: string
    message: string
    contexts: Record<string, ContextMessage[]>
    promptMessage?: Message | null
    composedMessage?: Message[]
  }) {
    lastPromptProjection.value = {
      capturedAt: Date.now(),
      sessionId: payload.sessionId,
      message: payload.message,
      contexts: cloneValue(payload.contexts),
      promptText: formatContextPromptText(payload.contexts),
      promptMessage: payload.promptMessage ? cloneValue(payload.promptMessage) : undefined,
      composedMessage: payload.composedMessage ? cloneValue(payload.composedMessage) : undefined,
    }
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
    clearHistory,
  }
})
