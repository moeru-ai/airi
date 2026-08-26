import type { FileFlavor } from '@grammyjs/files'
import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Bot, Context } from 'grammy'
import type { Message } from 'grammy/types'

import type { CancellablePromise } from './utils/promise'

export interface PendingMessage {
  message: Message
  interpretationPromise?: Promise<void>
  status: 'pending' | 'interpreting' | 'ready'
}

export type ExtendedContext = FileFlavor<Context>

export interface BotContext {
  bot: Bot
  messageQueue: Array<{
    message: Message
    status: 'pending' | 'interpreting' | 'ready'
  }>
  unreadMessages: Record<number, Message[]>
  processedIds: Set<string>
  logger: Logg
  processing: boolean
  lastInteractedNChatIds: string[]
  currentProcessingStartTime?: number
  chats: Map<string, ChatContext>
}

export interface ChatContext {
  chatId: string

  currentTask?: CancellablePromise<Message.TextMessage>
  currentAbortController?: AbortController

  messages: LLMMessage[]
  actions: { action: Action, result: unknown }[]
}

export interface ContinueAction {
  action: 'continue'
}

export interface BreakAction {
  action: 'break'
}

export interface SleepAction {
  action: 'sleep'
}

export interface ListChatsAction {
  action: 'list_chats'
}

export interface SendMessageAction {
  action: 'send_message'
  content: string
  chatId: string
}

export interface SendStickerAction {
  action: 'send_sticker'
  fileId: string
  chatId: string
}

export interface SearchGoogleAction {
  action: 'search_google'
  query: string
}

export interface ReadHistoryMessagesAction {
  action: 'read_history_messages'
  beforeMessageId?: string
  afterMessageId?: string
  chatId: string
}

export interface ReadUnreadMessagesAction {
  action: 'read_unread_messages'
  chatId: string
}

export interface ListStickersAction {
  action: 'list_stickers'
}

export type Action
  = | ContinueAction
    | BreakAction
    | SleepAction
    | ListChatsAction
    | SendMessageAction
    | SendStickerAction
    | SearchGoogleAction
    | ReadHistoryMessagesAction
    | ReadUnreadMessagesAction
    | ListStickersAction

export interface AttentionConfig {
  initialResponseRate: number
  responseRateMin: number
  responseRateMax: number
  cooldownMs: number
  triggerWords: string[]
  ignoreWords: string[]
  decayRatePerMinute: number
  decayCheckIntervalMs: number
}

export interface AttentionStats {
  mentionCount: number
  triggerWordCount: number
  lastInteractionTime: number
}

export interface AttentionState {
  currentResponseRate: number
  lastResponseTimes: Map<string, number>
  stats: AttentionStats
}

export interface AttentionResponse {
  shouldAct: boolean
  reason: string
  responseRate?: number
}
