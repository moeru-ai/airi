import { ref } from 'vue'

import { fetchConversationHistory as fetchLocalConversationHistory } from '../services/localMemoryClient'
import { useMemoryService } from './useMemoryService'

export interface HistoryMessage {
  id: string
  content: string
  type: 'user' | 'assistant'
  created_at: number
  platform?: string
  task?: string
}

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

      const result = await fetchLocalConversationHistory(limit, before, getActiveModelName())
      hasMore.value = result.hasMore
      return result.messages as HistoryMessage[]
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
