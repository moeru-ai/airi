import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'

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

export const useChatContextStore = defineStore('chat-context', () => {
  const activeContexts = ref<Record<string, ContextMessage[]>>({})

  function cloneMessage(message: ContextMessage): ContextMessage {
    const metadata = message.metadata?.source
      ? {
          source: {
            ...message.metadata.source,
            plugin: message.metadata.source.plugin
              ? {
                  ...message.metadata.source.plugin,
                  labels: message.metadata.source.plugin.labels
                    ? { ...message.metadata.source.plugin.labels }
                    : undefined,
                }
              : message.metadata.source.plugin,
            labels: message.metadata.source.labels
              ? { ...message.metadata.source.labels }
              : undefined,
          },
        }
      : undefined

    return {
      ...message,
      metadata,
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
    const sourceKey = getEventSourceKey(envelope)
    if (!activeContexts.value[sourceKey]) {
      activeContexts.value[sourceKey] = []
    }

    if (envelope.strategy === ContextUpdateStrategy.ReplaceSelf) {
      activeContexts.value[sourceKey] = [envelope]
      return {
        sourceKey,
        mutation: 'replace',
        entryCount: activeContexts.value[sourceKey].length,
      } satisfies ContextIngestResult
    }
    else if (envelope.strategy === ContextUpdateStrategy.AppendSelf) {
      activeContexts.value[sourceKey].push(envelope)
      return {
        sourceKey,
        mutation: 'append',
        entryCount: activeContexts.value[sourceKey].length,
      } satisfies ContextIngestResult
    }

    return undefined
  }

  function resetContexts() {
    activeContexts.value = {}
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
  }
})
