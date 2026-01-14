import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

import { getEventSourceKey } from '../../utils/event-source'

export interface ContextHistoryEntry extends ContextMessage {
  sourceKey: string
}

const CONTEXT_HISTORY_LIMIT = 400

export const useChatContextStore = defineStore('chat-context', () => {
  const activeContexts = ref<Record<string, ContextMessage[]>>({})
  const contextHistory = ref<ContextHistoryEntry[]>([])

  function ingestContextMessage(envelope: ContextMessage) {
    const sourceKey = getEventSourceKey(envelope)
    if (!activeContexts.value[sourceKey]) {
      activeContexts.value[sourceKey] = []
    }

    if (envelope.strategy === ContextUpdateStrategy.ReplaceSelf) {
      activeContexts.value[sourceKey] = [envelope]
    }
    else if (envelope.strategy === ContextUpdateStrategy.AppendSelf) {
      activeContexts.value[sourceKey].push(envelope)
    }

    contextHistory.value = [
      ...contextHistory.value,
      {
        ...envelope,
        sourceKey,
      },
    ].slice(-CONTEXT_HISTORY_LIMIT)
  }

  function resetContexts() {
    activeContexts.value = {}
    contextHistory.value = []
  }

  function getContextsSnapshot() {
    return toRaw(activeContexts.value)
  }

  return {
    ingestContextMessage,
    resetContexts,
    getContextsSnapshot,
    activeContexts,
    contextHistory,
  }
})
