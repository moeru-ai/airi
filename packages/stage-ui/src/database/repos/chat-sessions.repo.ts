import type { ChatSessionRecord, ChatSessionsIndex } from '../../types/chat-session'

import { chatAssetIdsOf, extractInlineChatAssets } from '../../libs/chat-assets'
import { storage } from '../storage'
import { chatAssetsRepo } from './chat-assets.repo'

const tombstoneKey = (userId: string) => `local:chat/tombstones/${userId}`
const outboxKey = (userId: string) => `local:chat/outbox/${userId}`

/**
 * Pending cloud send. Persisted in IDB so a tab close / reload / offline
 * window does not drop messages the user has already typed locally.
 *
 * `cloudChatId` is captured snapshot-style at enqueue time when known;
 * when absent (session not yet reconciled), drain looks it up from the
 * live `sessionMetas` ref and skips the entry until the mapping lands.
 */
export interface ChatSendOutboxEntry {
  /** Stable id matching the local message; reused on every retry so the server can dedup. */
  messageId: string
  sessionId: string
  cloudChatId?: string
  role: 'user' | 'assistant'
  content: string
  replyToMessageId?: string
  attempts: number
  lastError?: string
  queuedAt: number
}

/** Asset IDs that each session already owns in this window. A save adds the session as owner only for new IDs. */
const ownedAssets = new Map<string, Set<string>>()

async function retainAssets(sessionId: string, record: ChatSessionRecord) {
  const owned = ownedAssets.get(sessionId) ?? new Set<string>()
  const added = [...chatAssetIdsOf(record.messages)].filter(id => !owned.has(id))
  if (!added.length)
    return
  await chatAssetsRepo.retain(added, sessionId)
  added.forEach(id => owned.add(id))
  ownedAssets.set(sessionId, owned)
}

export const chatSessionsRepo = {
  async getIndex(userId: string) {
    const key = `local:chat/index/${userId}`
    return await storage.getItemRaw<ChatSessionsIndex>(key)
  },

  async saveIndex(index: ChatSessionsIndex) {
    const key = `local:chat/index/${index.userId}`
    await storage.setItemRaw(key, index)
  },

  /** A record that still holds image or audio bytes moves them into the asset store and is saved with references. */
  async getSession(sessionId: string) {
    const key = `local:chat/sessions/${sessionId}`
    const record = await storage.getItemRaw<ChatSessionRecord>(key)
    if (!record)
      return record
    const messages = await extractInlineChatAssets(record.messages, sessionId)
    if (messages === record.messages)
      return record
    const migrated = { ...record, messages }
    await this.saveSession(sessionId, migrated)
    return migrated
  },

  /**
   * The session becomes an owner of every asset that its messages reference.
   * A copied message, for example in a fork or an import, then keeps its asset after the source session is deleted.
   */
  async saveSession(sessionId: string, record: ChatSessionRecord) {
    const key = `local:chat/sessions/${sessionId}`
    await retainAssets(sessionId, record)
    await storage.setItemRaw(key, record)
  },

  // Cleanup
  /** Assets that no other session owns are deleted with the session. */
  async deleteSession(sessionId: string) {
    await storage.removeItem(`local:chat/sessions/${sessionId}`)
    ownedAssets.delete(sessionId)
    await chatAssetsRepo.releaseOwner(sessionId)
  },

  /**
   * Cloud-delete tombstones. When a user deletes a session offline (or before
   * the fire-and-forget DELETE response arrives) the cloud row may still be
   * present on the server's next `listChats`. Without these tombstones the
   * reconcile `adopt` branch would re-import the row and the deleted session
   * would visibly reappear.
   *
   * Stored as a flat array of `cloudChatId`s per user, keyed independently of
   * the index so the data survives index rewrites.
   */
  async getTombstones(userId: string): Promise<string[]> {
    const stored = await storage.getItemRaw<string[]>(tombstoneKey(userId))
    return stored ?? []
  },

  async addTombstone(userId: string, cloudChatId: string) {
    const current = await this.getTombstones(userId)
    if (current.includes(cloudChatId))
      return
    current.push(cloudChatId)
    await storage.setItemRaw(tombstoneKey(userId), current)
  },

  async removeTombstones(userId: string, cloudChatIds: string[]) {
    if (cloudChatIds.length === 0)
      return
    const current = await this.getTombstones(userId)
    const drop = new Set(cloudChatIds)
    const next = current.filter(id => !drop.has(id))
    if (next.length === current.length)
      return
    await storage.setItemRaw(tombstoneKey(userId), next)
  },

  /**
   * Outbox of message sends pending cloud delivery. Drained on every
   * reconcile + WS-open. Survives tab close / reload — the whole point
   * of the outbox is to never lose a write that landed locally but
   * never made it to the server.
   */
  async getOutbox(userId: string): Promise<ChatSendOutboxEntry[]> {
    const stored = await storage.getItemRaw<ChatSendOutboxEntry[]>(outboxKey(userId))
    return stored ?? []
  },

  async enqueueOutbox(userId: string, entry: ChatSendOutboxEntry) {
    const current = await this.getOutbox(userId)
    // Idempotent on messageId — re-queue overwrites in place rather than
    // duplicating, so a flap between online/offline doesn't multiply rows.
    const existingIndex = current.findIndex(e => e.messageId === entry.messageId)
    if (existingIndex >= 0)
      current[existingIndex] = entry
    else
      current.push(entry)
    await storage.setItemRaw(outboxKey(userId), current)
  },

  async dequeueOutbox(userId: string, messageIds: string[]) {
    if (messageIds.length === 0)
      return
    const current = await this.getOutbox(userId)
    const drop = new Set(messageIds)
    const next = current.filter(e => !drop.has(e.messageId))
    if (next.length === current.length)
      return
    await storage.setItemRaw(outboxKey(userId), next)
  },

  async updateOutboxEntries(userId: string, updates: Array<Pick<ChatSendOutboxEntry, 'messageId' | 'attempts' | 'lastError'>>) {
    if (updates.length === 0)
      return
    const current = await this.getOutbox(userId)
    const byId = new Map(updates.map(u => [u.messageId, u]))
    let changed = false
    const next = current.map((entry) => {
      const update = byId.get(entry.messageId)
      if (!update)
        return entry
      changed = true
      return { ...entry, attempts: update.attempts, lastError: update.lastError }
    })
    if (changed)
      await storage.setItemRaw(outboxKey(userId), next)
  },

  /** Remove every outbox entry for a session. Called when the session is deleted locally. */
  async dropOutboxForSession(userId: string, sessionId: string) {
    const current = await this.getOutbox(userId)
    const next = current.filter(e => e.sessionId !== sessionId)
    if (next.length === current.length)
      return
    await storage.setItemRaw(outboxKey(userId), next)
  },

  async clear(userId: string) {
    const index = await this.getIndex(userId)
    if (index) {
      for (const charIndex of Object.values(index.characters)) {
        for (const sessionId of Object.keys(charIndex.sessions)) {
          await this.deleteSession(sessionId)
        }
      }
      await storage.removeItem(`local:chat/index/${userId}`)
    }
    await storage.removeItem(tombstoneKey(userId))
    await storage.removeItem(outboxKey(userId))
  },
}
