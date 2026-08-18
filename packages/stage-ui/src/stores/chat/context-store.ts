import type { ContextHistoryEntry, ContextIngestResult, ContextMessage } from '@proj-airi/core-agent'

import { createContextRegistry } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { readonly, ref, toRaw } from 'vue'

import { getEventSourceKey } from '../../utils/event-source'

export type { ContextHistoryEntry, ContextIngestResult } from '@proj-airi/core-agent'

/**
 * UI-facing view of one active context source bucket.
 */
export interface ContextBucketSnapshot {
  /** Stable registry source bucket key. */
  sourceKey: string
  /** Number of active messages currently stored for this bucket. */
  entryCount: number
  /** Latest `createdAt` timestamp across messages in this bucket. */
  latestCreatedAt?: number
  /** Cloned context messages for devtools and UI consumers. */
  messages: ContextMessage[]
}

const CONTEXT_HISTORY_LIMIT = 400

export const useChatContextStore = defineStore('chat-context', () => {
  const registry = createContextRegistry({
    historyLimit: CONTEXT_HISTORY_LIMIT,
    getSourceKey: getEventSourceKey,
  })
  const activeContextsMirror = ref<Record<string, ContextMessage[]>>({})
  const contextHistoryMirror = ref<ContextHistoryEntry[]>([])
  const activeContexts = readonly(activeContextsMirror)
  const contextHistory = readonly(contextHistoryMirror)

  function syncRegistrySnapshot() {
    activeContextsMirror.value = registry.activeContexts()
    contextHistoryMirror.value = registry.contextHistory()
  }

  function ingestContextMessage(envelope: ContextMessage): ContextIngestResult | undefined {
    const result = registry.ingest(toRaw(envelope))
    syncRegistrySnapshot()
    return result
  }

  function resetContexts() {
    registry.reset()
    syncRegistrySnapshot()
  }

  function getContextsSnapshot() {
    return registry.snapshot()
  }

  function getContextBucketsSnapshot() {
    return Object.entries(registry.activeContexts()).map(([sourceKey, messages]) => ({
      sourceKey,
      entryCount: messages.length,
      latestCreatedAt: messages.reduce<number | undefined>((latest, message) => {
        if (!latest)
          return message.createdAt
        return Math.max(latest, message.createdAt)
      }, undefined),
      messages,
    } satisfies ContextBucketSnapshot))
  }

  return {
    ingestContextMessage,
    resetContexts,
    getContextsSnapshot,
    getContextBucketsSnapshot,
    activeContexts,
    contextHistory,
  }
})
