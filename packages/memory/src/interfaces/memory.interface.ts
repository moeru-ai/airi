export type MessageMetadata = Record<string, unknown>

export interface Message {
  role: string
  content: string
  timestamp: Date
  metadata?: MessageMetadata
}

export interface MemorySearchResult {
  message: Message
  similarity: number
  timestamp: Date
  metadata?: MessageMetadata
}

export interface IMemoryProvider {
  initialize: () => Promise<void>
  addMessage: (sessionId: string, message: Message) => Promise<void>
  getRecentMessages: (sessionId: string, limit?: number) => Promise<Message[]>
  searchSimilar: (query: string, userId: string, limit?: number) => Promise<MemorySearchResult[]>
  saveLongTermMemory: (message: Message, userId: string) => Promise<void>
  clearSession: (sessionId: string) => Promise<void>
}
