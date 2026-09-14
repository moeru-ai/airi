import type { Logg } from '@guiiai/logg'

import type { SatoriEvent } from '../adapter/satori/types'

import * as v from 'valibot'

// Action schemas
export const ContinueActionSchema = v.object({
  action: v.literal('continue'),
})

export const BreakActionSchema = v.object({
  action: v.literal('break'),
})

export const SleepActionSchema = v.object({
  action: v.literal('sleep'),
  duration: v.optional(v.number()),
})

export const ListChannelsActionSchema = v.object({
  action: v.literal('list_channels'),
})

export const SendMessageActionSchema = v.object({
  action: v.literal('send_message'),
  content: v.string(),
  channelId: v.string(),
})

export const ReadUnreadMessagesActionSchema = v.object({
  action: v.literal('read_unread_messages'),
  channelId: v.string(),
})

export const ActionSchema = v.union([
  ContinueActionSchema,
  BreakActionSchema,
  SleepActionSchema,
  ListChannelsActionSchema,
  SendMessageActionSchema,
  ReadUnreadMessagesActionSchema,
])

export type Action = v.InferOutput<typeof ActionSchema>

export interface CancellablePromise<T> {
  promise: Promise<T>
  cancel: () => void
}

export function cancellable<T>(promise: Promise<T>): CancellablePromise<T> {
  let cancel: () => void

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    cancel = () => reject(new Error('CANCELLED'))
    promise.then(resolve).catch(reject)
  })

  return {
    promise: wrappedPromise,
    cancel: () => cancel?.(),
  }
}

export interface PendingEvent {
  id: string
  event: SatoriEvent
  status: 'pending' | 'ready'
}

export interface StoredUnreadEvent {
  id: string
  event: SatoriEvent
}

export interface BotContext {
  logger: Logg
  eventQueue: PendingEvent[]
  unreadEvents: Record<string, StoredUnreadEvent[]> // channelId -> events
  processedIds: Set<string>
  lastInteractedChannelIds: string[]
  currentProcessingStartTime?: number
  chats: Map<string, ChatContext>
}

export interface ChatContext {
  channelId: string
  platform: string
  selfId: string
  isProcessing: boolean

  currentTask?: CancellablePromise<void>
  currentAbortController?: AbortController

  actions: { action: Action, result: unknown }[]
}
