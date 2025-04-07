import type { FileFlavor } from '@grammyjs/files'
import type { Logg } from '@guiiai/logg'
import type { Bot, Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { createAttentionHandler } from './bots/telegram/attention-handler'
import type { CancellablePromise } from './utils/promise'

export interface PendingMessage {
  message: Message
  interpretationPromise?: Promise<void>
  status: 'pending' | 'interpreting' | 'ready'
}

export type ExtendedContext = FileFlavor<Context>

export interface BotSelf {
  bot: Bot
  currentTask: CancellablePromise<Message.TextMessage> | null
  currentAbortController: AbortController | null
  messageQueue: Array<{
    message: Message
    status: 'pending' | 'interpreting' | 'ready'
  }>
  unreadMessages: Record<number, Message[]>
  processedIds: Set<string>
  logger: Logg
  processing: boolean
  attentionHandler: ReturnType<typeof createAttentionHandler>
  lastInteractedNChatIds: string[]
  currentProcessingStartTime: number | null
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

export interface LookupShortTermMemoryAction {
  action: 'lookupShortTermMemory'
  query: string
  category: 'chat' | 'self'
}

export interface LookupLongTermMemoryAction {
  action: 'lookupLongTermMemory'
  query: string
  category: 'chat' | 'self'
}

export interface MemorizeShortMemoryAction {
  action: 'memorizeShortMemory'
  content: string
  tags: string[]
}

export interface MemorizeLongMemoryAction {
  action: 'memorizeLongMemory'
  content: string
  tags: string[]
}

export interface ForgetShortTermMemoryAction {
  action: 'forgetShortTermMemory'
  where: {
    id: string
  }
}

export interface ForgetLongTermMemoryAction {
  action: 'forgetLongTermMemory'
  where: {
    id: string
  }
}

export interface ListChatsAction {
  action: 'listChats'
}

export interface SendMessageAction {
  action: 'sendMessage'
  content: string
  chatId: string
}

export interface SearchGoogleAction {
  action: 'searchGoogle'
  query: string
}

export interface ReadMessagesAction {
  action: 'readMessages'
  chatId: string
}

export type Action = ContinueAction | BreakAction | SleepAction | LookupShortTermMemoryAction | LookupLongTermMemoryAction | MemorizeShortMemoryAction | MemorizeLongMemoryAction | ForgetShortTermMemoryAction | ForgetLongTermMemoryAction | ListChatsAction | SendMessageAction | SearchGoogleAction | ReadMessagesAction

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
