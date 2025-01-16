import type { FileFlavor } from '@grammyjs/files'
import type { Logg } from '@guiiai/logg'
import type { Bot, Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { CancellablePromise } from './utils/promise'

export interface PendingMessage {
  message: Message
  interpretationPromise?: Promise<void>
  status: 'pending' | 'interpreting' | 'ready'
}

export type ExtendedContext = FileFlavor<Context>

export interface BotSelf {
  bot: Bot
  currentTask: CancellablePromise<any> | null
  messageQueue: PendingMessage[]
  unreadMessages: Record<string, Message[]>
  processedIds: Set<string>
  logger: Logg
  processing: boolean
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
  groupId: string
}

export interface SearchGoogleAction {
  action: 'searchGoogle'
  query: string
}

export interface ReadMessagesAction {
  action: 'readMessages'
  groupId: string
}

export type Action = ContinueAction | BreakAction | SleepAction | LookupShortTermMemoryAction | LookupLongTermMemoryAction | MemorizeShortMemoryAction | MemorizeLongMemoryAction | ForgetShortTermMemoryAction | ForgetLongTermMemoryAction | ListChatsAction | SendMessageAction | SearchGoogleAction | ReadMessagesAction
