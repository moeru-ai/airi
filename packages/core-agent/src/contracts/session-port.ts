import type { ChatHistoryItem } from '../types/chat'

export interface AgentSessionPort {
  appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void
  ensureSession: (sessionId: string) => void
  getSessionGeneration: (sessionId: string) => number
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
}
