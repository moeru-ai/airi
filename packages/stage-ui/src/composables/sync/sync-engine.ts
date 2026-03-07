/**
 * Sync engine: the central coordinator for local-first chat sync.
 *
 * Dual-channel: WebSocket for real-time push, HTTP for reliable pull.
 * Outbox pattern: messages queued locally, delivered reliably.
 */
import { computed, ref } from 'vue'

import { storage } from '../../database/storage'
import { SERVER_URL } from '../../libs/server'
import { client } from '../api'
import { createOutbox } from './outbox'
import { createWsClient } from './ws-client'

export type SyncStatus = 'connected' | 'connecting' | 'disconnected' | 'syncing' | 'error'

export interface SyncMessage {
  id: string
  chatId: string
  seq: number
  parentId?: string | null
  senderId: string
  role: string
  content: string
  mediaIds: string[]
  stickerIds: string[]
  replyToMessageId?: string | null
  forwardFromMessageId?: string | null
  createdAt: string
  updatedAt: string
  editedAt?: string | null
  deletedAt?: string | null
}

export interface NewMessagePayload {
  id: string
  role: string
  content: string
  parentId?: string
  createdAt?: number
}

interface SyncCursor {
  chatId: string
  lastSyncSeq: number
}

function cursorKey(chatId: string) {
  return `local:sync-cursors/${chatId}`
}

async function getSyncCursor(chatId: string): Promise<number> {
  const cursor = await storage.getItemRaw<SyncCursor>(cursorKey(chatId))
  return cursor?.lastSyncSeq ?? 0
}

async function saveSyncCursor(chatId: string, seq: number) {
  await storage.setItemRaw<SyncCursor>(cursorKey(chatId), { chatId, lastSyncSeq: seq })
}

export function createSyncEngine() {
  const status = ref<SyncStatus>('disconnected')
  const outbox = createOutbox()

  // Event callbacks
  let onNewMessage: ((chatId: string, message: SyncMessage) => void) | null = null
  let onMessageEdited: ((chatId: string, message: SyncMessage) => void) | null = null
  let onMessageDeleted: ((chatId: string, messageId: string) => void) | null = null
  let onTyping: ((chatId: string, userId: string) => void) | null = null

  // WS URL: convert http(s) to ws(s)
  const wsUrl = `${SERVER_URL.replace(/^http/, 'ws')}/api/ws`

  const wsClient = createWsClient({
    url: wsUrl,
    onMessage: (data) => {
      switch (data.type) {
        case 'new_message':
          if (data.chatId && data.message) {
            onNewMessage?.(data.chatId, data.message as SyncMessage)
            // Update sync cursor
            if (typeof data.seq === 'number') {
              void saveSyncCursor(data.chatId, data.seq)
            }
          }
          break
        case 'message_edited':
          if (data.chatId && data.message) {
            onMessageEdited?.(data.chatId, data.message as SyncMessage)
          }
          break
        case 'message_deleted':
          if (data.chatId && data.messageId) {
            onMessageDeleted?.(data.chatId, data.messageId as string)
          }
          break
        case 'typing':
          if (data.chatId && data.userId) {
            onTyping?.(data.chatId, data.userId as string)
          }
          break
        case 'send_ack':
          // ACK from server for a message we sent via WS
          if (typeof data.seq === 'number' && data.chatId) {
            void saveSyncCursor(data.chatId as string, data.seq)
          }
          break
      }
    },
    onStatusChange: (wsStatus) => {
      if (wsStatus === 'connected') {
        status.value = 'connected'
      }
      else if (wsStatus === 'connecting') {
        status.value = 'connecting'
      }
      else if (wsStatus === 'error') {
        status.value = 'error'
      }
      else {
        status.value = 'disconnected'
      }
    },
  })

  // HTTP send function for outbox
  async function httpSendMessage(chatId: string, message: NewMessagePayload): Promise<{ seq: number }> {
    const res = await client.api.conversations[':chatId'].messages.$post({
      param: { chatId },
      json: { messages: [message] },
    })
    if (!res.ok)
      throw new Error(`Failed to push message: ${res.status}`)
    const data = await res.json() as { messages: Array<{ id: string, seq: number }> }
    return { seq: data.messages[0]?.seq ?? 0 }
  }

  // Combined send: try WS first, fall back to HTTP
  async function sendViaChannel(chatId: string, message: NewMessagePayload): Promise<{ seq: number }> {
    if (wsClient.isConnected()) {
      // Send via WS — but we still need to wait for ACK to get seq
      // For simplicity, use HTTP which is request/response
      // WS send is fire-and-forget, we get seq via send_ack event
      // Use HTTP for reliable seq assignment
    }
    return await httpSendMessage(chatId, message)
  }

  return {
    status: computed(() => status.value),
    pendingCount: computed(() => outbox.pendingCount.value),

    /**
     * Start the sync engine: connect WS + start outbox processing.
     */
    start() {
      wsClient.connect()
      outbox.start(sendViaChannel)
    },

    /**
     * Stop the sync engine.
     */
    stop() {
      wsClient.disconnect()
      outbox.stop()
    },

    /**
     * Subscribe to real-time updates for specific chats.
     */
    subscribe(chatIds: string[]) {
      wsClient.send({ type: 'subscribe', chatIds })
    },

    /**
     * Unsubscribe from chat updates.
     */
    unsubscribe(chatIds: string[]) {
      wsClient.send({ type: 'unsubscribe', chatIds })
    },

    /**
     * Send a message: write to outbox for reliable delivery.
     */
    async sendMessage(chatId: string, message: NewMessagePayload) {
      await outbox.enqueue({
        id: message.id,
        chatId,
        message,
      })
    },

    /**
     * Pull messages from server since last sync cursor.
     */
    async pullMessages(chatId: string, sinceSeq?: number): Promise<SyncMessage[]> {
      const cursor = sinceSeq ?? await getSyncCursor(chatId)

      const res = await client.api.conversations[':chatId'].messages.$get({
        param: { chatId },
        query: { since_seq: String(cursor), limit: '200' },
      })

      if (!res.ok)
        throw new Error(`Failed to pull messages: ${res.status}`)

      const data = await res.json() as { messages: SyncMessage[], hasMore: boolean }

      // Update sync cursor to the max seq we received
      if (data.messages.length > 0) {
        const maxSeq = Math.max(...data.messages.map(m => m.seq))
        await saveSyncCursor(chatId, maxSeq)
      }

      // If there are more, recursively pull
      if (data.hasMore && data.messages.length > 0) {
        const lastSeq = data.messages[data.messages.length - 1].seq
        const more = await this.pullMessages(chatId, lastSeq)
        return [...data.messages, ...more]
      }

      return data.messages
    },

    /**
     * Full sync: pull all new messages for all subscribed chats.
     */
    async syncAll(chatIds: string[]) {
      const oldStatus = status.value
      status.value = 'syncing'

      try {
        const results = new Map<string, SyncMessage[]>()
        for (const chatId of chatIds) {
          const messages = await this.pullMessages(chatId)
          if (messages.length > 0)
            results.set(chatId, messages)
        }
        return results
      }
      finally {
        status.value = wsClient.isConnected() ? 'connected' : oldStatus
      }
    },

    /**
     * Mark a conversation as read up to a specific seq.
     */
    async markRead(chatId: string, seq: number) {
      wsClient.send({ type: 'ack', chatId, seq })
      await client.api.conversations[':id'].read.$post({
        param: { id: chatId },
        json: { seq },
      })
    },

    /**
     * Send typing indicator.
     */
    sendTyping(chatId: string) {
      wsClient.send({ type: 'typing', chatId })
    },

    /**
     * Register event handlers.
     */
    onNewMessage(handler: (chatId: string, message: SyncMessage) => void) {
      onNewMessage = handler
    },
    onMessageEdited(handler: (chatId: string, message: SyncMessage) => void) {
      onMessageEdited = handler
    },
    onMessageDeleted(handler: (chatId: string, messageId: string) => void) {
      onMessageDeleted = handler
    },
    onTyping(handler: (chatId: string, userId: string) => void) {
      onTyping = handler
    },

    /**
     * Get sync cursor for a chat.
     */
    getSyncCursor,

    /**
     * Save sync cursor for a chat.
     */
    saveSyncCursor,
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
