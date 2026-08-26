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
  channelId: v.string(),
  content: v.string(),
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

export interface BotContext {
  chats: Map<string, ChatContext>
  currentProcessingStartTime?: number
  eventQueue: PendingEvent[]
  lastInteractedChannelIds: string[]
  logger: Logg
  processedIds: Set<string>
  unreadEvents: Record<string, StoredUnreadEvent[]> // channelId -> events
}

export interface CancellablePromise<T> {
  cancel: () => void
  promise: Promise<T>
}

export interface ChatContext {
  actions: { action: Action, result: unknown }[]
  channelId: string
  currentAbortController?: AbortController
  currentTask?: CancellablePromise<void>

  isProcessing: boolean
  platform: string

  selfId: string
}

export interface PendingEvent {
  event: SatoriEvent
  id: string
  status: 'pending' | 'ready'
}

export interface StoredUnreadEvent {
  event: SatoriEvent
  id: string
}

export function cancellable<T>(promise: Promise<T>): CancellablePromise<T> {
  let cancel: () => void

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    cancel = () => reject(new Error('CANCELLED'))
    promise.then(resolve).catch(reject)
  })

  return {
    cancel: () => cancel?.(),
    promise: wrappedPromise,
  }
}
