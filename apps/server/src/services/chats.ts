import type { MessageRole, WireMessage } from '@proj-airi/server-sdk-shared'

import type { Database } from '../libs/db'
import type { EngagementMetrics } from '../otel'

import { useLogger } from '@guiiai/logg'
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

import { createForbiddenError, createNotFoundError } from '../utils/error'
import { nanoid } from '../utils/id'

import * as schema from '../schemas/chats'

const logger = useLogger('chats')

type ChatType = 'private' | 'bot' | 'group' | 'channel'
type ChatMemberType = 'user' | 'character' | 'bot'

interface CreateChatPayload {
  id?: string
  type?: ChatType
  title?: string
  members?: { type: ChatMemberType, userId?: string, characterId?: string }[]
}

interface PushMessage {
  id: string
  role: string
  content: string
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function clampLimit(limit?: number): number {
  if (!limit || limit <= 0)
    return 100
  return Math.min(limit, 500)
}

export function resolveSenderId(role: string, userId: string, characterId?: string | null): string | null {
  if (role === 'user')
    return userId
  return characterId ?? null
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createChatService(db: Database, metrics?: EngagementMetrics | null) {
  // ---- internal helpers ---------------------------------------------------

  async function verifyMembership(tx: Parameters<Parameters<Database['transaction']>[0]>[0], chatId: string, userId: string) {
    const chat = await tx.query.chats.findFirst({
      where: and(eq(schema.chats.id, chatId), isNull(schema.chats.deletedAt)),
    })
    if (!chat)
      throw createNotFoundError('Chat not found')

    const member = await tx.query.chatMembers.findFirst({
      where: and(
        eq(schema.chatMembers.chatId, chatId),
        eq(schema.chatMembers.memberType, 'user'),
        eq(schema.chatMembers.userId, userId),
      ),
    })
    if (!member) {
      logger.withFields({ userId, chatId }).warn('User not a member of chat, forbidden')
      throw createForbiddenError()
    }

    return chat
  }

  // ---- public API ---------------------------------------------------------

  return {
    // -- Chat management (REST) ---------------------------------------------

    async createChat(userId: string, payload: CreateChatPayload) {
      return db.transaction(async (tx) => {
        const chatId = payload.id ?? nanoid()
        const now = new Date()

        await tx.insert(schema.chats).values({
          id: chatId,
          type: payload.type ?? 'group',
          title: payload.title ?? null,
          createdAt: now,
          updatedAt: now,
        })

        // Always add creator as a user member
        await tx.insert(schema.chatMembers).values({
          chatId,
          memberType: 'user',
          userId,
          characterId: null,
        })

        // Add additional members if provided
        if (payload.members && payload.members.length > 0) {
          const extra = payload.members
            .filter(m => m.type !== 'user' || m.userId !== userId) // skip duplicate creator
            .map(m => ({
              chatId,
              memberType: m.type,
              userId: m.type === 'user' ? (m.userId ?? null) : null,
              characterId: m.type !== 'user' ? (m.characterId ?? null) : null,
            }))

          if (extra.length > 0) {
            await tx.insert(schema.chatMembers).values(extra)
          }
        }

        return { id: chatId, type: payload.type ?? 'group', title: payload.title ?? null, createdAt: now, updatedAt: now }
      })
    },

    async getChat(userId: string, chatId: string) {
      return db.transaction(async (tx) => {
        const chat = await verifyMembership(tx, chatId, userId)
        const members = await tx.query.chatMembers.findMany({
          where: eq(schema.chatMembers.chatId, chatId),
        })
        return { ...chat, members }
      })
    },

    async listChats(userId: string) {
      const rows = await db
        .select({ chat: schema.chats })
        .from(schema.chatMembers)
        .innerJoin(schema.chats, eq(schema.chatMembers.chatId, schema.chats.id))
        .where(and(
          eq(schema.chatMembers.memberType, 'user'),
          eq(schema.chatMembers.userId, userId),
          isNull(schema.chats.deletedAt),
        ))

      return rows.map(r => r.chat)
    },

    async updateChat(userId: string, chatId: string, updates: { title?: string }) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        const now = new Date()

        const [updated] = await tx.update(schema.chats)
          .set({ ...updates, updatedAt: now })
          .where(eq(schema.chats.id, chatId))
          .returning()

        return updated
      })
    },

    async deleteChat(userId: string, chatId: string) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)
        const now = new Date()

        const [deleted] = await tx.update(schema.chats)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(schema.chats.id, chatId))
          .returning()

        return deleted
      })
    },

    async addMember(userId: string, chatId: string, member: { type: ChatMemberType, userId?: string, characterId?: string }) {
      // TODO: Push these invariants up into the HTTP schema and convert failures to API errors instead of generic Error.
      // Validate that user-type members have a userId and non-user members have a characterId
      if (member.type === 'user' && !member.userId) {
        throw new Error('userId is required for user-type members')
      }
      if (member.type !== 'user' && !member.characterId) {
        throw new Error('characterId is required for non-user-type members')
      }

      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        const [added] = await tx.insert(schema.chatMembers).values({
          chatId,
          memberType: member.type,
          userId: member.type === 'user' ? (member.userId ?? null) : null,
          characterId: member.type !== 'user' ? (member.characterId ?? null) : null,
        }).returning()

        return added
      })
    },

    async getMembers(chatId: string) {
      return db.query.chatMembers.findMany({
        where: eq(schema.chatMembers.chatId, chatId),
      })
    },

    async removeMember(userId: string, chatId: string, memberId: string) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        const [removed] = await tx.delete(schema.chatMembers)
          .where(and(
            eq(schema.chatMembers.id, memberId),
            eq(schema.chatMembers.chatId, chatId),
          ))
          .returning()

        if (!removed)
          throw createNotFoundError('Member not found')
        return removed
      })
    },

    // -- Message sync (WS) --------------------------------------------------

    async pushMessages(userId: string, chatId: string, messages: PushMessage[], characterId?: string) {
      const result = await db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        // Lock chat row to serialize seq assignment
        const [chatRow] = await tx
          .select({ id: schema.chats.id })
          .from(schema.chats)
          .where(eq(schema.chats.id, chatId))
          .for('update')

        if (!chatRow)
          throw createNotFoundError('Chat not found')

        // Get current max seq for this chat
        const [{ maxSeq }] = await tx
          .select({ maxSeq: sql<number>`coalesce(max(${schema.messages.seq}), 0)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, chatId))

        const now = new Date()

        // Split into new vs existing messages
        const messageIds = messages.map(m => m.id)
        const existingMessages = messageIds.length > 0
          ? await tx.select({ id: schema.messages.id }).from(schema.messages).where(inArray(schema.messages.id, messageIds))
          : []
        const existingIds = new Set(existingMessages.map(m => m.id))

        const newMsgs = messages.filter(m => !existingIds.has(m.id))
        const updateMsgs = messages.filter(m => existingIds.has(m.id))

        let currentSeq = maxSeq

        // Insert new messages with seq
        if (newMsgs.length > 0) {
          const values = newMsgs.map((m) => {
            currentSeq++
            return {
              id: m.id,
              chatId,
              senderId: resolveSenderId(m.role, userId, characterId),
              role: m.role,
              seq: currentSeq,
              content: m.content,
              mediaIds: [] as string[],
              stickerIds: [] as string[],
              createdAt: now,
              updatedAt: now,
            }
          })
          await tx.insert(schema.messages).values(values)
        }

        // Update existing messages (content + updatedAt + seq bump)
        for (const m of updateMsgs) {
          currentSeq++
          await tx.update(schema.messages)
            .set({ content: m.content, seq: currentSeq, updatedAt: now })
            .where(and(eq(schema.messages.id, m.id), eq(schema.messages.chatId, chatId)))
        }

        // Update chat updatedAt
        await tx.update(schema.chats)
          .set({ updatedAt: now })
          .where(eq(schema.chats.id, chatId))

        return {
          seq: currentSeq,
          fromSeq: maxSeq + 1,
          toSeq: currentSeq,
          newCount: newMsgs.length,
          totalCount: messages.length,
        }
      })

      if (result.totalCount > 0) {
        metrics?.chatMessages.add(result.totalCount)
      }
      metrics?.wsMessagesReceived.add(result.totalCount)

      return { seq: result.seq, fromSeq: result.fromSeq, toSeq: result.toSeq }
    },

    /**
     * Soft-delete the user's footprint in chats. Per-chat strategy depends
     * on `chat.type`:
     *
     * - `private` / `bot` (1-on-1, user IS the chat): soft-delete the chat
     *   row + the user's messages. Nothing else can read those messages
     *   (chat is gone), so soft-deleting them is just keeping audit consistent.
     *
     * - `group` / `channel` (shared): drop only this user's `chat_members`
     *   row; the chat + other members survive. The user's messages are
     *   **kept intact** — deleting them would corrupt the conversation
     *   context for remaining members ("B replied to nothing"). Sender
     *   anonymization is automatic: `messages.senderId` is bare text with
     *   no FK, so after better-auth hard-deletes the user row, the senderId
     *   string still groups the user's messages together but cannot be
     *   joined to any PII (name / email are gone with the user row). The
     *   UI is expected to render `senderId` whose user lookup misses as
     *   "Deleted User".
     *
     * `chat_members` rows for shared chats are **hard-deleted** because the
     * table was designed without a `deletedAt` column; auditing who was in
     * which chat is preserved through `messages.senderId` for the messages
     * the user actually authored.
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows on
     * retry; re-deleting an already-removed `chat_members` row is a no-op.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      // Join chat_members → chats so we can branch by chat.type without a
      // second round-trip per row.
      const memberChats = await db
        .select({ chatId: schema.chatMembers.chatId, chatType: schema.chats.type })
        .from(schema.chatMembers)
        .innerJoin(schema.chats, eq(schema.chatMembers.chatId, schema.chats.id))
        .where(eq(schema.chatMembers.userId, userId))

      const soloChatIds = memberChats
        .filter(r => r.chatType === 'private' || r.chatType === 'bot')
        .map(r => r.chatId)
      const sharedChatIds = memberChats
        .filter(r => r.chatType === 'group' || r.chatType === 'channel')
        .map(r => r.chatId)

      let soloChatCount = 0
      let droppedMemberships = 0
      let soloMessageCount = 0
      let preservedSharedMessages = 0

      if (soloChatIds.length > 0) {
        const updatedChats = await db.update(schema.chats)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(
            inArray(schema.chats.id, soloChatIds),
            isNull(schema.chats.deletedAt),
          ))
          .returning({ id: schema.chats.id })
        soloChatCount = updatedChats.length

        // Soft-delete user-authored messages in solo chats only. The chat
        // itself is gone, so this is purely audit/consistency hygiene.
        const updatedMessages = await db.update(schema.messages)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(
            inArray(schema.messages.chatId, soloChatIds),
            eq(schema.messages.senderId, userId),
            isNull(schema.messages.deletedAt),
          ))
          .returning({ id: schema.messages.id })
        soloMessageCount = updatedMessages.length
      }

      if (sharedChatIds.length > 0) {
        const dropped = await db.delete(schema.chatMembers)
          .where(and(
            inArray(schema.chatMembers.chatId, sharedChatIds),
            eq(schema.chatMembers.userId, userId),
          ))
          .returning({ id: schema.chatMembers.id })
        droppedMemberships = dropped.length

        // Count (do not mutate) the user's messages in shared chats to make
        // the preservation visible in logs. These rows stay live so other
        // members keep their conversation context; sender anonymizes itself
        // once better-auth hard-deletes the user row.
        const kept = await db.select({ id: schema.messages.id })
          .from(schema.messages)
          .where(and(
            inArray(schema.messages.chatId, sharedChatIds),
            eq(schema.messages.senderId, userId),
            isNull(schema.messages.deletedAt),
          ))
        preservedSharedMessages = kept.length
      }

      logger.withFields({
        userId,
        soloChats: soloChatCount,
        sharedChatMembershipsDropped: droppedMemberships,
        soloMessages: soloMessageCount,
        preservedSharedMessages,
      }).log('Chats footprint processed for user (solo soft-deleted, shared anonymized)')
    },

    async pullMessages(userId: string, chatId: string, afterSeq: number, limit?: number) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId)

        const clamped = clampLimit(limit)

        const rows = await tx
          .select()
          .from(schema.messages)
          .where(and(
            eq(schema.messages.chatId, chatId),
            gt(schema.messages.seq, afterSeq),
          ))
          .orderBy(schema.messages.seq)
          .limit(clamped)

        // Get current max seq
        const [{ maxSeq }] = await tx
          .select({ maxSeq: sql<number>`coalesce(max(${schema.messages.seq}), 0)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, chatId))

        const wireMessages: WireMessage[] = rows.map(r => ({
          id: r.id,
          chatId: r.chatId,
          senderId: r.senderId,
          role: r.role as MessageRole,
          content: r.content,
          seq: r.seq!,
          createdAt: r.createdAt.getTime(),
          updatedAt: r.updatedAt.getTime(),
        }))

        return { messages: wireMessages, seq: maxSeq }
      })
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
