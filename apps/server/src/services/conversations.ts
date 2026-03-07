import type { Database } from '../libs/db'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { createForbiddenError, createNotFoundError } from '../utils/error'

import * as schema from '../schemas/chats'

type ChatType = 'private' | 'bot' | 'group' | 'channel'
type ChatMemberType = 'user' | 'character' | 'bot'
type ChatMemberRole = 'owner' | 'admin' | 'member'

interface CreateConversationPayload {
  type: ChatType
  title?: string
  members?: Array<{
    type: ChatMemberType
    userId?: string
    characterId?: string
    role?: ChatMemberRole
  }>
}

interface AddMemberPayload {
  type: ChatMemberType
  userId?: string
  characterId?: string
  role?: ChatMemberRole
}

export function createConversationService(db: Database) {
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

  async function assertAdminOrOwner(chatId: string, userId: string) {
    const member = await assertMembership(chatId, userId)
    if (member.role !== 'owner' && member.role !== 'admin')
      throw createForbiddenError('Insufficient permissions')
    return member
  }

  return {
    async create(userId: string, payload: CreateConversationPayload) {
      return await db.transaction(async (tx) => {
        const now = new Date()

        const [chat] = await tx.insert(schema.chats).values({
          type: payload.type,
          title: payload.title,
          createdAt: now,
          updatedAt: now,
        }).returning()

        // Add creator as owner
        await tx.insert(schema.chatMembers).values({
          chatId: chat.id,
          memberType: 'user',
          userId,
          role: 'owner',
          joinedAt: now,
        })

        // Add other members
        if (payload.members?.length) {
          const memberValues = payload.members
            .filter(m => m.type !== 'user' || m.userId !== userId) // skip creator duplicate
            .map(m => ({
              chatId: chat.id,
              memberType: m.type,
              userId: m.type === 'user' ? m.userId : null,
              characterId: m.type === 'character' ? m.characterId : null,
              role: m.role ?? 'member' as ChatMemberRole,
              joinedAt: now,
            }))

          if (memberValues.length > 0) {
            await tx.insert(schema.chatMembers).values(memberValues)
          }
        }

        const members = await tx.query.chatMembers.findMany({
          where: eq(schema.chatMembers.chatId, chat.id),
        })

        return { ...chat, members }
      })
    },

    async list(userId: string) {
      // Get all chat IDs this user is a member of
      const memberships = await db.query.chatMembers.findMany({
        where: and(
          eq(schema.chatMembers.memberType, 'user'),
          eq(schema.chatMembers.userId, userId),
        ),
      })

      if (memberships.length === 0)
        return []

      const chatIds = memberships.map(m => m.chatId)
      const membershipMap = new Map(memberships.map(m => [m.chatId, m]))

      const conversations = await db.query.chats.findMany({
        where: and(
          sql`${schema.chats.id} IN (${sql.join(chatIds.map(id => sql`${id}`), sql`, `)})`,
          isNull(schema.chats.deletedAt),
        ),
        orderBy: [desc(schema.chats.lastMessageAt), desc(schema.chats.createdAt)],
      })

      // Get all members for all conversations
      const allMembers = await db.query.chatMembers.findMany({
        where: sql`${schema.chatMembers.chatId} IN (${sql.join(chatIds.map(id => sql`${id}`), sql`, `)})`,
      })

      const membersByChatId = new Map<string, typeof allMembers>()
      for (const member of allMembers) {
        const list = membersByChatId.get(member.chatId) ?? []
        list.push(member)
        membersByChatId.set(member.chatId, list)
      }

      return conversations.map((chat) => {
        const membership = membershipMap.get(chat.id)!
        const unreadCount = Math.max(0, chat.maxSeq - membership.lastReadSeq)
        return {
          ...chat,
          members: membersByChatId.get(chat.id) ?? [],
          unreadCount,
          lastReadSeq: membership.lastReadSeq,
        }
      })
    },

    async get(userId: string, chatId: string) {
      const membership = await assertMembership(chatId, userId)

      const chat = await db.query.chats.findFirst({
        where: and(eq(schema.chats.id, chatId), isNull(schema.chats.deletedAt)),
      })

      if (!chat)
        throw createNotFoundError('Conversation not found')

      const members = await db.query.chatMembers.findMany({
        where: eq(schema.chatMembers.chatId, chatId),
      })

      return {
        ...chat,
        members,
        unreadCount: Math.max(0, chat.maxSeq - membership.lastReadSeq),
        lastReadSeq: membership.lastReadSeq,
      }
    },

    async update(userId: string, chatId: string, updates: { title?: string }) {
      await assertAdminOrOwner(chatId, userId)

      const [updated] = await db.update(schema.chats)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.chats.id, chatId))
        .returning()

      return updated
    },

    async remove(userId: string, chatId: string) {
      await assertAdminOrOwner(chatId, userId)

      await db.update(schema.chats)
        .set({ deletedAt: new Date() })
        .where(eq(schema.chats.id, chatId))
    },

    async addMember(userId: string, chatId: string, payload: AddMemberPayload) {
      await assertAdminOrOwner(chatId, userId)

      const [member] = await db.insert(schema.chatMembers).values({
        chatId,
        memberType: payload.type,
        userId: payload.type === 'user' ? payload.userId : null,
        characterId: payload.type === 'character' ? payload.characterId : null,
        role: payload.role ?? 'member',
        joinedAt: new Date(),
      }).returning()

      return member
    },

    async removeMember(userId: string, chatId: string, memberId: string) {
      await assertAdminOrOwner(chatId, userId)

      const member = await db.query.chatMembers.findFirst({
        where: and(
          eq(schema.chatMembers.id, memberId),
          eq(schema.chatMembers.chatId, chatId),
        ),
      })

      if (!member)
        throw createNotFoundError('Member not found')

      if (member.role === 'owner')
        throw createForbiddenError('Cannot remove the owner')

      await db.delete(schema.chatMembers)
        .where(eq(schema.chatMembers.id, memberId))
    },

    async markRead(userId: string, chatId: string, seq: number) {
      await db.update(schema.chatMembers)
        .set({ lastReadSeq: seq })
        .where(and(
          eq(schema.chatMembers.chatId, chatId),
          eq(schema.chatMembers.memberType, 'user'),
          eq(schema.chatMembers.userId, userId),
        ))
    },
  }
}

export type ConversationService = ReturnType<typeof createConversationService>
