import type { ChatHistoryItem } from '../types/chat'

export interface AgentSessionPort {
  ensureSession: (sessionId: string) => void
  getSessionMessages: (sessionId: string) => ChatHistoryItem[]
  appendSessionMessage: (sessionId: string, message: ChatHistoryItem) => void
  getSessionGeneration: (sessionId: string) => number
}
