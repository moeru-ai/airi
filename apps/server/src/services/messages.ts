import type { Database } from '../libs/db'

import { and, eq, gt, lt, sql } from 'drizzle-orm'

import { createForbiddenError, createNotFoundError } from '../utils/error'

import * as schema from '../schemas/chats'

interface SendMessagePayload {
  id: string
  role: string
  content: string
  parentId?: string
  createdAt?: number
}

export function createMessageService(db: Database) {
  async function assertMembership(chatId: string, userId: string) {
    const member = await db.query.chatMembers.findFirst({
      where: and(
        eq(schema.chatMembers.chatId, chatId),
        eq(schema.chatMembers.memberType, 'user'),
        eq(schema.chatMembers.userId, userId),
      ),
    })
    if (!member)
      throw createForbiddenError('Not a member of this conversation')
    return member
  }

  function resolveSenderId(role: string, userId: string, _chatId: string) {
    if (role === 'user')
      return userId
    // For AI/system messages, use role as senderId
    return role
  }

  return {
    /**
     * Push messages to a conversation.
     * Idempotent: existing message IDs are skipped.
     * Returns the list of actually inserted messages with their assigned seq.
     */
    async pushMessages(userId: string, chatId: string, messages: SendMessagePayload[]) {
      await assertMembership(chatId, userId)

      if (messages.length === 0)
        return { messages: [], chatId }

      return await db.transaction(async (tx) => {
        const now = new Date()
        const inserted: Array<{ id: string, seq: number }> = []

        for (const msg of messages) {
          // Check if message already exists (idempotent)
          const existing = await tx.query.messages.findFirst({
            where: eq(schema.messages.id, msg.id),
          })

          if (existing) {
            inserted.push({ id: existing.id, seq: existing.seq })
            continue
          }

          // Increment maxSeq atomically
          const [chatUpdate] = await tx.update(schema.chats)
            .set({
              maxSeq: sql`${schema.chats.maxSeq} + 1`,
              lastMessageAt: now,
              lastMessagePreview: msg.content.slice(0, 100),
              updatedAt: now,
            })
            .where(eq(schema.chats.id, chatId))
            .returning({ maxSeq: schema.chats.maxSeq })

          const seq = chatUpdate.maxSeq

          await tx.insert(schema.messages).values({
            id: msg.id,
            chatId,
            seq,
            parentId: msg.parentId ?? null,
            senderId: resolveSenderId(msg.role, userId, chatId),
            role: msg.role,
            content: msg.content,
            mediaIds: [],
            stickerIds: [],
            createdAt: msg.createdAt ? new Date(msg.createdAt) : now,
            updatedAt: now,
          })

          inserted.push({ id: msg.id, seq })
        }

        return { messages: inserted, chatId }
      })
    },

    /**
     * Pull messages from a conversation incrementally.
     * Returns messages with seq > sinceSeq, ordered by seq ASC.
     */
    async pullMessages(userId: string, chatId: string, options: {
      sinceSeq?: number
      beforeSeq?: number
      limit?: number
    } = {}) {
      await assertMembership(chatId, userId)

      const { sinceSeq = 0, beforeSeq, limit = 50 } = options
      const clampedLimit = Math.min(limit, 200)

      const conditions = [
        eq(schema.messages.chatId, chatId),
        gt(schema.messages.seq, sinceSeq),
      ]

      if (beforeSeq !== undefined) {
        conditions.push(lt(schema.messages.seq, beforeSeq))
      }

      const msgs = await db
        .select()
        .from(schema.messages)
        .where(and(...conditions))
        .orderBy(schema.messages.seq)
        .limit(clampedLimit + 1) // +1 to check hasMore

      const hasMore = msgs.length > clampedLimit
      const resultMessages = hasMore ? msgs.slice(0, clampedLimit) : msgs

      return {
        messages: resultMessages,
        hasMore,
      }
    },

    /**
     * Edit a message. LWW: updates content and editedAt.
     * Bumps seq so other clients can pull the change.
     */
    async editMessage(userId: string, chatId: string, messageId: string, content: string) {
      await assertMembership(chatId, userId)

      const message = await db.query.messages.findFirst({
        where: and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.chatId, chatId),
        ),
      })

      if (!message)
        throw createNotFoundError('Message not found')

      // Only the sender can edit
      if (message.senderId !== userId)
        throw createForbiddenError('Can only edit your own messages')

      return await db.transaction(async (tx) => {
        const now = new Date()

        // Bump maxSeq for the edit
        const [chatUpdate] = await tx.update(schema.chats)
          .set({
            maxSeq: sql`${schema.chats.maxSeq} + 1`,
            updatedAt: now,
          })
          .where(eq(schema.chats.id, chatId))
          .returning({ maxSeq: schema.chats.maxSeq })

        const [updated] = await tx.update(schema.messages)
          .set({
            content,
            editedAt: now,
            updatedAt: now,
            seq: chatUpdate.maxSeq,
          })
          .where(eq(schema.messages.id, messageId))
          .returning()

        return updated
      })
    },

    /**
     * Soft-delete a message. Bumps seq so other clients can pull the change.
     */
    async deleteMessage(userId: string, chatId: string, messageId: string) {
      await assertMembership(chatId, userId)

      const message = await db.query.messages.findFirst({
        where: and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.chatId, chatId),
        ),
      })

      if (!message)
        throw createNotFoundError('Message not found')

      return await db.transaction(async (tx) => {
        const now = new Date()

        const [chatUpdate] = await tx.update(schema.chats)
          .set({
            maxSeq: sql`${schema.chats.maxSeq} + 1`,
            updatedAt: now,
          })
          .where(eq(schema.chats.id, chatId))
          .returning({ maxSeq: schema.chats.maxSeq })

        await tx.update(schema.messages)
          .set({
            deletedAt: now,
            updatedAt: now,
            seq: chatUpdate.maxSeq,
          })
          .where(eq(schema.messages.id, messageId))
      })
    },
  }
}

export type MessageService = ReturnType<typeof createMessageService>
