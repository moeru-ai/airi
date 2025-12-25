import type { ChatMessage, ChatSlices } from '../../../types/chat'

export interface ChatErrorMessage {
  role: 'error'
  content: string
}

export type ChatHistoryMessage = (ChatMessage | ChatErrorMessage) & {
  slices?: ChatSlices[]
  context?: {
    ts?: number
    [key: string]: unknown
  }
}
