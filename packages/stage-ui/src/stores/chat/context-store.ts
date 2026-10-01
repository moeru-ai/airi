import type { ContextIngestResult, ContextMessage, ContextReader, ContextRegistryState } from '@proj-airi/core-agent'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { errorMessageFrom } from '@moeru/std'
import { createContextRegistry, projectContextRegistryState } from '@proj-airi/core-agent'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, readonly, ref, toRaw } from 'vue'

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
const CONTEXT_CLEANUP_INTERVAL_MS = 2000

export const useChatContextStore = defineStore('chat-context', () => {
  const registryState = ref<ContextRegistryState>({ active: {}, history: [] })
  const writerRemovalHistory = ref<Array<{ sourceKey: string, eventId: string }>>([])
  const activeContexts = computed(() => readonly(projectContextRegistryState(toRaw(registryState.value))))
  const contextHistory = computed(() => readonly(registryState.value.history))
  let leadership: SyncedPiniaRuntime | undefined
  let stopLeadershipListener: (() => void) | undefined
  let cleanupInterval: ReturnType<typeof setInterval> | undefined

  function restoreRegistry() {
    return createContextRegistry({
      historyLimit: CONTEXT_HISTORY_LIMIT,
      getSourceKey: getEventSourceKey,
      initialState: toRaw(registryState.value),
    })
  }

  async function ingestContextMessage(envelope: ContextMessage): Promise<ContextIngestResult | undefined> {
    const sourceKey = getEventSourceKey(envelope)
    // Server and broadcast copies share an event identity. Only the first delivery changes the pool.
    if (registryState.value.history.some(entry => entry.sourceKey === sourceKey && entry.id === envelope.id && entry.contextId === envelope.contextId))
      return undefined
    const registry = restoreRegistry()
    const result = registry.ingest(toRaw(envelope))
    registryState.value = registry.checkpoint()
    return result
  }

  async function resetContexts() {
    registryState.value = { active: {}, history: [] }
  }

  async function removeContextWriter(sourceKey: string, eventId: string): Promise<boolean> {
    if (writerRemovalHistory.value.some(entry => entry.sourceKey === sourceKey && entry.eventId === eventId))
      return false
    const registry = restoreRegistry()
    const removed = registry.removeWriter(sourceKey)
    // Every renderer receives the same lifecycle event. Keep its identity across writer reconnection and leader promotion.
    writerRemovalHistory.value = [...writerRemovalHistory.value, { sourceKey, eventId }].slice(-CONTEXT_HISTORY_LIMIT)
    if (removed)
      registryState.value = registry.checkpoint()
    return removed
  }

  async function pruneContexts() {
    const next = restoreRegistry().checkpoint()
    const count = (state: ContextRegistryState) => Object.values(state.active).reduce((total, entries) => total + entries.length, 0)
    if (count(next) !== count(registryState.value))
      registryState.value = next
  }

  function stopCleanup() {
    if (cleanupInterval !== undefined)
      clearInterval(cleanupInterval)
    cleanupInterval = undefined
  }

  /** Binds idle cleanup to the elected renderer, not to request or component lifetimes. */
  function initialize(runtime: SyncedPiniaRuntime) {
    if (leadership === runtime)
      return
    dispose()
    leadership = runtime
    stopLeadershipListener = runtime.onLeadershipChange((isLeader) => {
      stopCleanup()
      if (!isLeader)
        return
      const prune = () => {
        if (!runtime.isLeader())
          return
        void pruneContexts().catch((error) => {
          console.warn('[chat-context] Failed to prune expired observations:', errorMessageFrom(error))
        })
      }
      prune()
      cleanupInterval = setInterval(prune, CONTEXT_CLEANUP_INTERVAL_MS)
    })
  }

  function dispose() {
    stopLeadershipListener?.()
    stopLeadershipListener = undefined
    stopCleanup()
    leadership = undefined
  }

  function getContextsSnapshot(reader?: ContextReader) {
    return projectContextRegistryState(toRaw(registryState.value), reader)
  }

  function getContextBucketsSnapshot() {
    return Object.entries(getContextsSnapshot()).map(([sourceKey, messages]) => ({
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

  onScopeDispose(dispose)

  return {
    registryState,
    writerRemovalHistory,
    initialize,
    dispose,
    ingestContextMessage,
    resetContexts,
    removeContextWriter,
    pruneContexts,
    getContextsSnapshot,
    getContextBucketsSnapshot,
    activeContexts,
    contextHistory,
  }
}, {
  synced: {
    actions: ['ingestContextMessage', 'resetContexts', 'pruneContexts', 'removeContextWriter'],
    state: true,
  },
})
