import type { FileFlavor } from '@grammyjs/files'
import type { Logg } from '@guiiai/logg'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Bot, Context } from 'grammy'
import type { Message } from 'grammy/types'

import type { CancellablePromise } from './utils/promise'

export type Action
  = | BreakAction
    | ContinueAction
    | ListChatsAction
    | ListStickersAction
    | ReadHistoryMessagesAction
    | ReadUnreadMessagesAction
    | SearchGoogleAction
    | SendMessageAction
    | SendStickerAction
    | SleepAction

export interface AttentionConfig {
  cooldownMs: number
  decayCheckIntervalMs: number
  decayRatePerMinute: number
  ignoreWords: string[]
  initialResponseRate: number
  responseRateMax: number
  responseRateMin: number
  triggerWords: string[]
}

export interface AttentionResponse {
  reason: string
  responseRate?: number
  shouldAct: boolean
}

export interface AttentionState {
  currentResponseRate: number
  lastResponseTimes: Map<string, number>
  stats: AttentionStats
}

export interface AttentionStats {
  lastInteractionTime: number
  mentionCount: number
  triggerWordCount: number
}

export interface BotContext {
  bot: Bot
  chats: Map<string, ChatContext>
  currentProcessingStartTime?: number
  lastInteractedNChatIds: string[]
  logger: Logg
  messageQueue: Array<{
    message: Message
    status: 'interpreting' | 'pending' | 'ready'
  }>
  processedIds: Set<string>
  processing: boolean
  unreadMessages: Record<number, Message[]>
}

export interface BreakAction {
  action: 'break'
}

export interface ChatContext {
  actions: { action: Action, result: unknown }[]

  chatId: string
  currentAbortController?: AbortController

  currentTask?: CancellablePromise<Message.TextMessage>
  messages: LLMMessage[]
}

export interface ContinueAction {
  action: 'continue'
}

export type ExtendedContext = FileFlavor<Context>

export interface ListChatsAction {
  action: 'list_chats'
}

export interface ListStickersAction {
  action: 'list_stickers'
}

export interface PendingMessage {
  interpretationPromise?: Promise<void>
  message: Message
  status: 'interpreting' | 'pending' | 'ready'
}

export interface ReadHistoryMessagesAction {
  action: 'read_history_messages'
  afterMessageId?: string
  beforeMessageId?: string
  chatId: string
}

export interface ReadUnreadMessagesAction {
  action: 'read_unread_messages'
  chatId: string
}

export interface SearchGoogleAction {
  action: 'search_google'
  query: string
}

export interface SendMessageAction {
  action: 'send_message'
  chatId: string
  content: string
}

export interface SendStickerAction {
  action: 'send_sticker'
  chatId: string
  fileId: string
}

export interface SleepAction {
  action: 'sleep'
}
