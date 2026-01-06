import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'

import type { CancellablePromise } from '../utils/promise'
import type { SatoriMessage } from './satori'

export interface PendingMessage {
  message: SatoriMessage
  status: 'pending' | 'ready'
}

export interface BotContext {
  logger: Logg
  messageQueue: PendingMessage[]
  unreadMessages: Record<string, SatoriMessage[]> // channelId -> messages
  processedIds: Set<string>
  processing: boolean
  lastInteractedChannelIds: string[]
  currentProcessingStartTime?: number
  chats: Map<string, ChatContext>
}

export interface ChatContext {
  channelId: string
  platform: string
  selfId: string

  currentTask?: CancellablePromise<void>
  currentAbortController?: AbortController

  messages: LLMMessage[]
  actions: { action: Action, result: unknown }[]
}

// Action types
export interface ContinueAction {
  action: 'continue'
}

export interface BreakAction {
  action: 'break'
}

export interface SleepAction {
  action: 'sleep'
  seconds?: number
}

export interface ListChannelsAction {
  action: 'list_channels'
}

export interface SendMessageAction {
  action: 'send_message'
  content: string
  channelId: string
}

export interface ReadUnreadMessagesAction {
  action: 'read_unread_messages'
  channelId: string
}

export type Action
  = | ContinueAction
    | BreakAction
    | SleepAction
    | ListChannelsAction
    | SendMessageAction
    | ReadUnreadMessagesAction
