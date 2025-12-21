export interface HistoryMessage {
  id: string
  content: string
  type: 'user' | 'assistant'
  created_at: number
  platform?: string
  task?: string
}

class ConversationHistoryService {
  // @ts-expect-error
  async fetchConversationHistory(limit: number = 10, before?: number, modelName?: string): Promise<{ messages: HistoryMessage[], hasMore: boolean }> {
    // TODO: Implement actual fetching logic, potentially from a backend service or a different local storage
    console.warn('ConversationHistoryService.fetchConversationHistory not implemented. Returning mock data.')
    return {
      messages: [],
      hasMore: false,
    }
  }

  // @ts-expect-error
  async addMessage(message: HistoryMessage): Promise<void> {
    // TODO: Implement actual adding logic
    console.warn('ConversationHistoryService.addMessage not implemented.')
  }

  async clearHistory(): Promise<void> {
    // TODO: Implement actual clearing logic
    console.warn('ConversationHistoryService.clearHistory not implemented.')
  }
}

export const conversationHistoryService = new ConversationHistoryService()
