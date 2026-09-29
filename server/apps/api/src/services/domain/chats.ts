import type { MessageRole, SendMessagesRequest, WireMessage } from '@proj-airi/server-sdk-shared'

import type { Database } from '../../libs/db'
import type { EngagementMetrics } from '../../otel'
import type { BindContactInput, CreateChatInput } from '../../routes/chats/schema'

import { useLogger } from '@guiiai/logg'
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'

import { contacts } from '../../schemas/contacts'
import { createBadRequestError, createConflictError, createForbiddenError, createNotFoundError } from '../../utils/error'
import { nanoid } from '../../utils/id'

import * as schema from '../../schemas/chats'

const logger = useLogger('chats')

type ChatMemberType = 'user' | 'character' | 'bot'

type PushMessage = SendMessagesRequest['messages'][number]

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function clampLimit(limit?: number): number {
  if (!limit || limit <= 0)
    return 100
  return Math.min(limit, 500)
}

export function resolveSenderId(role: string, userId: string): string | null {
  if (role === 'user' || role === 'assistant')
    return userId
  return null
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createChatService(db: Database, metrics?: EngagementMetrics | null) {
  // ---- internal helpers ---------------------------------------------------

  /** Write commands hold the chat lock through commit so deletion cannot invalidate authorization before a write. */
  async function verifyMembership(tx: Parameters<Parameters<Database['transaction']>[0]>[0], chatId: string, userId: string, lock = false) {
    const query = tx.select().from(schema.chats).where(and(eq(schema.chats.id, chatId), isNull(schema.chats.deletedAt)))
    const [chat] = await (lock ? query.for('update') : query)
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

    async createChat(userId: string, payload: CreateChatInput) {
      return db.transaction(async (tx) => {
        const chatId = payload.id ?? nanoid()
        const now = new Date()
        let contact = null
        if (payload.contactId) {
          if (payload.type !== 'bot' || payload.members !== undefined)
            throw createBadRequestError('Contact chats require type bot and server-owned members')
          const [owned] = await tx.select().from(contacts).where(and(eq(contacts.id, payload.contactId), eq(contacts.ownerId, userId))).for('update')
          if (!owned || owned.deletedAt)
            throw createNotFoundError('Contact not found')
          contact = owned
        }
        else if (payload.type === 'bot' && payload.members?.length) {
          const characterIds = payload.members
            .filter(member => member.type !== 'user' && member.characterId)
            .map(member => member.characterId!)
          if (characterIds.length > 0) {
            for (const characterId of [...new Set(characterIds)].sort())
              await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userId, characterId])}, 0))`)
            const registered = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.ownerId, userId), or(inArray(contacts.characterId, characterIds), inArray(contacts.localCharacterId, characterIds)))).orderBy(contacts.id).for('update')
            if (registered.length > 0)
              throw createBadRequestError('Use contactId for registered character conversations')
          }
        }

        await tx.insert(schema.chats).values({
          id: chatId,
          type: payload.type ?? 'group',
          title: payload.title ?? null,
          contactId: contact?.id ?? null,
          contactOwnerId: contact?.ownerId ?? null,
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

        if (contact) {
          await tx.insert(schema.chatMembers).values({
            chatId,
            memberType: 'character',
            characterId: contact.characterId,
          })
        }

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

        return { id: chatId, type: payload.type ?? 'group', title: payload.title ?? null, contactId: contact?.id ?? null, contactOwnerId: contact?.ownerId ?? null, createdAt: now, updatedAt: now }
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
        .selectDistinct({ chat: schema.chats })
        .from(schema.chatMembers)
        .innerJoin(schema.chats, eq(schema.chatMembers.chatId, schema.chats.id))
        .where(and(
          eq(schema.chatMembers.memberType, 'user'),
          eq(schema.chatMembers.userId, userId),
          isNull(schema.chats.deletedAt),
        ))

      if (rows.length === 0)
        return []
      const members = await db.select().from(schema.chatMembers).where(inArray(schema.chatMembers.chatId, rows.map(row => row.chat.id)))
      return rows.map(({ chat }) => {
        const participants = members.filter(member => member.chatId === chat.id)
        const users = participants.filter(member => member.memberType === 'user')
        const characters = participants.filter(member => member.memberType !== 'user')
        const identifiable = chat.type === 'bot' && chat.contactId === null
          && users.length === 1 && users[0].userId === userId
          && characters.length === 1
        return { ...chat, legacyCharacterId: identifiable ? characters[0].characterId : null }
      })
    },

    /** Binds an owned direct history without changing message ids or sequence values. A supplied legacy id must match exactly. */
    async bindContact(userId: string, chatId: string, input: BindContactInput) {
      return db.transaction(async (tx) => {
        const [contact] = await tx.select().from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.ownerId, userId))).for('update')
        if (!contact || contact.deletedAt)
          throw createNotFoundError('Contact not found')
        const chat = await verifyMembership(tx, chatId, userId, true)
        if (chat.contactId === contact.id)
          return chat
        if (chat.contactId !== null)
          throw createConflictError('Conversation already belongs to a contact')
        if (chat.type !== 'bot')
          throw createBadRequestError('Only direct character conversations can be bound')
        const members = await tx.select().from(schema.chatMembers).where(eq(schema.chatMembers.chatId, chatId))
        const users = members.filter(member => member.memberType === 'user')
        const characters = members.filter(member => member.memberType !== 'user')
        if (users.length !== 1 || users[0].userId !== userId)
          throw createBadRequestError('Shared conversations cannot become contact histories')
        if (input.expectedCharacterId !== undefined && (
          characters.length !== 1 || characters[0].characterId !== input.expectedCharacterId
          || contact.localCharacterId !== input.expectedCharacterId
        )) {
          throw createConflictError('Legacy character binding changed or is ambiguous')
        }
        if (characters.length > 0)
          await tx.delete(schema.chatMembers).where(inArray(schema.chatMembers.id, characters.map(member => member.id)))
        await tx.insert(schema.chatMembers).values({ chatId, memberType: 'character', characterId: contact.characterId })
        const [bound] = await tx.update(schema.chats)
          .set({ contactId: contact.id, contactOwnerId: userId })
          .where(eq(schema.chats.id, chatId))
          .returning()
        return bound
      })
    },

    async updateChat(userId: string, chatId: string, updates: { title?: string }) {
      return db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId, true)
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
        await verifyMembership(tx, chatId, userId, true)
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
        const chat = await verifyMembership(tx, chatId, userId, true)
        if (chat.contactId)
          throw createBadRequestError('Contact chat members cannot be changed')

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
        const chat = await verifyMembership(tx, chatId, userId, true)
        if (chat.contactId)
          throw createBadRequestError('Contact chat members cannot be changed')

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

    async pushMessages(userId: string, chatId: string, messages: PushMessage[]) {
      if (messages.some(message => message.role !== 'user' && message.role !== 'assistant'))
        throw createBadRequestError('Only user and assistant messages can be synchronized')

      const result = await db.transaction(async (tx) => {
        await verifyMembership(tx, chatId, userId, true)

        // Get current max seq for this chat
        const [{ maxSeq }] = await tx
          .select({ maxSeq: sql<number>`coalesce(max(${schema.messages.seq}), 0)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, chatId))

        const now = new Date()

        // Split into new vs existing messages
        const messageIds = messages.map(m => m.id)
        const existingMessages = messageIds.length > 0
          ? await tx.select({
              id: schema.messages.id,
              chatId: schema.messages.chatId,
              senderId: schema.messages.senderId,
              role: schema.messages.role,
              content: schema.messages.content,
            }).from(schema.messages).where(inArray(schema.messages.id, messageIds))
          : []

        if (existingMessages.some(message => message.chatId !== chatId))
          throw createConflictError('Message already belongs to another chat')

        const existingMessagesById = new Map(existingMessages.map(message => [message.id, message]))
        const unchangedLegacyAssistantIds = new Set<string>()
        if (messages.some((message) => {
          const existingMessage = existingMessagesById.get(message.id)
          if (existingMessage == null)
            return false

          if (existingMessage.senderId === resolveSenderId(message.role, userId))
            return false

          // A pre-ownership assistant row cannot be safely attributed to a user.
          // An exact retry is nevertheless safe to acknowledge because it does
          // not mutate the stored message or its sequence.
          if (
            existingMessage.senderId == null
            && existingMessage.role === 'assistant'
            && message.role === 'assistant'
            && existingMessage.content === message.content
          ) {
            unchangedLegacyAssistantIds.add(message.id)
            return false
          }

          return true
        })) {
          throw createForbiddenError()
        }

        const existingIds = new Set(existingMessages.map(m => m.id))

        const newMsgs = messages.filter(m => !existingIds.has(m.id))
        const updateMsgs = messages.filter(m => existingIds.has(m.id) && !unchangedLegacyAssistantIds.has(m.id))

        let currentSeq = maxSeq

        // Insert new messages with seq
        if (newMsgs.length > 0) {
          const values = newMsgs.map((m) => {
            currentSeq++
            return {
              id: m.id,
              chatId,
              senderId: resolveSenderId(m.role, userId),
              role: m.role,
              seq: currentSeq,
              content: m.content,
              replyToMessageId: m.replyToMessageId ?? null,
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
            .set({ content: m.content, replyToMessageId: m.replyToMessageId ?? null, seq: currentSeq, updatedAt: now })
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
          replyToMessageId: r.replyToMessageId,
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
