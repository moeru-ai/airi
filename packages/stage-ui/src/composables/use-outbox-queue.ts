import type { Ref } from 'vue'

import { useOnline } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { ref, watch } from 'vue'

import { outboxRepo } from '../database/repos/outbox.repo'

export interface OutboxItem<T = unknown> {
  id: string
  type: string
  payload: T
  attempts: number
  createdAt: number
  updatedAt: number
  lastError?: string
}

export type OutboxHandler<T = unknown> = (payload: T) => Promise<void>

const handlers = new Map<string, OutboxHandler<unknown>>()
let processing = false
let initialized = false
let onlineState: Ref<boolean> | null = null

function serializeError(error: unknown) {
  if (error instanceof Error)
    return error.message
  return String(error)
}

export async function enqueueOutbox(type: string, payload: unknown, error?: unknown) {
  const now = Date.now()
  const item: OutboxItem = {
    id: nanoid(),
    type,
    payload,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    lastError: error ? serializeError(error) : undefined,
  }
  await outboxRepo.enqueue(item)
}

export function registerOutboxHandler<T = unknown>(type: string, handler: OutboxHandler<T>) {
  handlers.set(type, handler as OutboxHandler<unknown>)
  if (onlineState?.value) {
    processOutboxQueue()
  }
}

export async function processOutboxQueue() {
  if (processing)
    return
  processing = true
  try {
    const items = await outboxRepo.getAll()
    for (const item of items) {
      const handler = handlers.get(item.type)
      if (!handler)
        continue
      try {
        await handler(item.payload)
        await outboxRepo.remove(item.id)
      }
      catch (error) {
        item.attempts += 1
        item.updatedAt = Date.now()
        item.lastError = serializeError(error)
        await outboxRepo.upsert(item)
      }
    }
  }
  finally {
    processing = false
  }
}

function ensureOutboxQueue() {
  if (initialized)
    return onlineState ?? ref(true)
  initialized = true
  onlineState = useOnline()
  watch(onlineState, (isOnline) => {
    if (isOnline)
      processOutboxQueue()
  }, { immediate: true })
  return onlineState
}

export function useOutboxQueue() {
  const online = ensureOutboxQueue()
  return {
    online,
    processOutboxQueue,
  }
}
