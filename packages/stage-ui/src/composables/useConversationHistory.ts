import { ref } from 'vue'

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
  const { memoryServiceEnabled, memoryServiceUrl, memoryApiKey } = useMemoryService()

  const isLoading = ref(false)
  const hasMore = ref(false)
  const error = ref<string | null>(null)

  // Load conversation history
  async function loadHistory(limit: number = 10, before?: number) {
    if (!memoryServiceEnabled.value || !memoryServiceUrl.value) {
      return []
    }

    try {
      isLoading.value = true
      error.value = null

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (memoryApiKey.value.trim()) {
        headers.Authorization = `Bearer ${memoryApiKey.value}`
      }

      const url = new URL('/api/conversations', memoryServiceUrl.value)
      url.searchParams.set('limit', limit.toString())
      if (before) {
        url.searchParams.set('before', before.toString())
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.statusText}`)
      }

      const data = await response.json()
      hasMore.value = data.hasMore
      return data.messages as HistoryMessage[]
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
