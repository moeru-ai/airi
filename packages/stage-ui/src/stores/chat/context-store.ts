import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

import { getEventSourceKey } from '../../utils/event-source'

export interface ContextBucketSnapshot {
  sourceKey: string
  entryCount: number
  latestCreatedAt?: number
  messages: ContextMessage[]
}

export interface ContextIngestResult {
  sourceKey: string
  mutation: 'replace' | 'append'
  entryCount: number
}

export interface ContextHistoryEntry extends ContextMessage {
  sourceKey: string
}

const CONTEXT_HISTORY_LIMIT = 400

export const useChatContextStore = defineStore('chat-context', () => {
  const activeContexts = ref<Record<string, ContextMessage[]>>({})
  const contextHistory = ref<ContextHistoryEntry[]>([])

  function cloneMessage(message: ContextMessage): ContextMessage {
    const rawMessage = toRaw(message)

    try {
      return structuredClone(rawMessage)
    }
    catch {
      return JSON.parse(JSON.stringify(rawMessage)) as ContextMessage
    }
  }

  function cloneSnapshot() {
    return Object.fromEntries(
      Object.entries(activeContexts.value).map(([sourceKey, messages]) => [
        sourceKey,
        messages.map(cloneMessage),
      ]),
    )
  }

  function ingestContextMessage(envelope: ContextMessage) {
    const normalizedEnvelope = cloneMessage(envelope)
    const sourceKey = getEventSourceKey(normalizedEnvelope)
    let result: ContextIngestResult | undefined

    if (!activeContexts.value[sourceKey]) {
      activeContexts.value[sourceKey] = []
    }

    if (normalizedEnvelope.strategy === ContextUpdateStrategy.ReplaceSelf) {
      activeContexts.value[sourceKey] = [normalizedEnvelope]
      result = {
        sourceKey,
        mutation: 'replace',
        entryCount: activeContexts.value[sourceKey].length,
      } satisfies ContextIngestResult
    }
    else if (normalizedEnvelope.strategy === ContextUpdateStrategy.AppendSelf) {
      activeContexts.value[sourceKey].push(normalizedEnvelope)
      result = {
        sourceKey,
        mutation: 'append',
        entryCount: activeContexts.value[sourceKey].length,
      } satisfies ContextIngestResult
    }

    contextHistory.value = [
      ...contextHistory.value,
      {
        ...normalizedEnvelope,
        sourceKey,
      },
    ].slice(-CONTEXT_HISTORY_LIMIT)

    return result
  }

  function resetContexts() {
    activeContexts.value = {}
    contextHistory.value = []
  }

  function getContextsSnapshot() {
    return cloneSnapshot()
  }

  function getContextBucketsSnapshot() {
    return Object.entries(activeContexts.value).map(([sourceKey, messages]) => ({
      sourceKey,
      entryCount: messages.length,
      latestCreatedAt: messages.reduce<number | undefined>((latest, message) => {
        if (!latest)
          return message.createdAt
        return Math.max(latest, message.createdAt)
      }, undefined),
      messages: messages.map(cloneMessage),
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
