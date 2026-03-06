import type { Logg } from '@guiiai/logg'
import type { Message } from '@xsai/shared-chat'
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk'

export interface BotContext {
  client: MatrixClient
  logger: Logg
  processedIds: Set<string>
  messageQueue: {
    event: MatrixEvent
    status: 'pending' | 'interpreting' | 'ready'
  }[]
  unreadMessages: Record<string, MatrixEvent[]>
  lastInteractedNChatIds: string[]
  processing: boolean
  chats: Map<string, ChatContext>
  currentProcessingStartTime?: number
}

export interface ChatContext {
  roomId: string
  currentAbortController?: AbortController
  messages: Message[]
  actions: { action: any, result: string }[]
  currentTask?: any
}
