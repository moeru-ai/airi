/**
 * Outbox queue for reliable message delivery.
 * Uses the existing 'outbox' mount in unstorage (IndexedDB: airi-sync-queue).
 * Messages survive page refresh and are processed in FIFO order.
 */
import { ref } from 'vue'

import { storage } from '../../database/storage'

export interface OutboxEntry {
  id: string
  chatId: string
  message: {
    id: string
    role: string
    content: string
    parentId?: string
    createdAt?: number
  }
  createdAt: number
  retryCount: number
}

export type SendFn = (chatId: string, message: OutboxEntry['message']) => Promise<{ seq: number }>

export function createOutbox() {
  const pendingCount = ref(0)
  const processing = ref(false)
  let sendFn: SendFn | null = null
  let processTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function outboxKey(id: string) {
    return `outbox:pending/${id}`
  }

  async function refreshCount() {
    const keys = await storage.getKeys('outbox:pending')
    pendingCount.value = keys.length
  }

  async function enqueue(entry: Omit<OutboxEntry, 'createdAt' | 'retryCount'>) {
    const full: OutboxEntry = {
      ...entry,
      createdAt: Date.now(),
      retryCount: 0,
    }
    await storage.setItemRaw(outboxKey(entry.id), full)
    pendingCount.value++
    scheduleProcess()
  }

  async function dequeue(id: string) {
    await storage.removeItem(outboxKey(id))
    pendingCount.value = Math.max(0, pendingCount.value - 1)
  }

  async function getAllPending(): Promise<OutboxEntry[]> {
    const keys = await storage.getKeys('outbox:pending')
    const entries: OutboxEntry[] = []
    for (const key of keys) {
      const entry = await storage.getItemRaw<OutboxEntry>(key)
      if (entry)
        entries.push(entry)
    }
    // Sort by createdAt for FIFO
    entries.sort((a, b) => a.createdAt - b.createdAt)
    return entries
  }

  function scheduleProcess() {
    if (processTimer || stopped)
      return
    processTimer = setTimeout(() => {
      processTimer = null
      void processQueue()
    }, 100)
  }

  async function processQueue() {
    if (processing.value || stopped || !sendFn)
      return

    processing.value = true

    try {
      const entries = await getAllPending()

      for (const entry of entries) {
        if (stopped)
          break

        try {
          await sendFn(entry.chatId, entry.message)
          await dequeue(entry.id)
        }
        catch {
          // Increment retry count and update
          entry.retryCount++
          await storage.setItemRaw(outboxKey(entry.id), entry)

          // Exponential backoff: wait before retrying next
          const backoffMs = Math.min(1000 * 2 ** entry.retryCount, 30000)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }
    }
    finally {
      processing.value = false
    }

    // Check if there are more items to process
    await refreshCount()
    if (pendingCount.value > 0 && !stopped) {
      scheduleProcess()
    }
  }

  function start(fn: SendFn) {
    sendFn = fn
    stopped = false
    void refreshCount().then(() => {
      if (pendingCount.value > 0)
        scheduleProcess()
    })
  }

  function stop() {
    stopped = true
    sendFn = null
    if (processTimer) {
      clearTimeout(processTimer)
      processTimer = null
    }
  }

  return {
    pendingCount,
    processing,
    enqueue,
    dequeue,
    start,
    stop,
    refreshCount,
  }
}

export type Outbox = ReturnType<typeof createOutbox>
