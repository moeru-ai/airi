import { ref } from 'vue'

import { conversationHistoryService, type HistoryMessage } from '../services'
import { useMemoryService } from './useMemoryService'

export type { HistoryMessage }

export function useConversationHistory() {
  const { memoryServiceEnabled, getActiveModelName } = useMemoryService()

  const isLoading = ref(false)
  const hasMore = ref(false)
  const error = ref<string | null>(null)

  // Load conversation history
  async function loadHistory(limit: number = 10, before?: number) {
    if (!memoryServiceEnabled.value) {
      return []
    }

    try {
      isLoading.value = true
      error.value = null

      const result = await conversationHistoryService.fetchConversationHistory(limit, before, getActiveModelName())
      hasMore.value = result.hasMore
      return result.messages
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load conversation history'
      return []
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    loadHistory,
    isLoading,
    hasMore,
    error,
  }
}
