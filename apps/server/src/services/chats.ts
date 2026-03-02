import type { Database } from '../libs/db'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { createConflictError, createForbiddenError } from '../utils/error'

import * as schema from '../schemas/chats'

type ChatType = 'private' | 'bot' | 'group' | 'channel'
type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'error'
type ChatMemberType = 'user' | 'character' | 'bot'

interface SyncChatMessagePayload {
  id: string
  role: MessageRole
  content: string
  createdAt?: number
}

interface SyncChatMemberPayload {
  type: ChatMemberType
  userId?: string
  characterId?: string
}

interface SyncChatPayload {
  chat: {
    id: string
    type?: ChatType
    title?: string
    createdAt?: number
    updatedAt?: number
  }
  members?: SyncChatMemberPayload[]
  messages: SyncChatMessagePayload[]
}

function resolveSenderId(role: MessageRole, userId: string, characterId?: string) {
  if (role === 'user')
    return userId
  return characterId ?? role
}

function pickCharacterId(members: SyncChatMemberPayload[] | undefined) {
  return members?.find(member => member.type === 'character' && member.characterId)?.characterId
}

export function createChatService(db: Database) {
  return {
    async syncChat(userId: string, payload: SyncChatPayload) {
      return await db.transaction(async (tx) => {
        const now = new Date()
        const chatId = payload.chat.id
        const members = payload.members ?? []
        const characterId = pickCharacterId(members)

        const existingChat = await tx.query.chats.findFirst({
          where: eq(schema.chats.id, chatId),
        })

        if (existingChat) {
          const member = await tx.query.chatMembers.findFirst({
            where: and(
              eq(schema.chatMembers.chatId, chatId),
              eq(schema.chatMembers.memberType, 'user'),
              eq(schema.chatMembers.userId, userId),
            ),
          })

          if (!member)
            throw createForbiddenError()
        }

        if (!existingChat) {
          await tx.insert(schema.chats).values({
            id: chatId,
            type: payload.chat.type ?? 'group',
            title: payload.chat.title,
            createdAt: payload.chat.createdAt ? new Date(payload.chat.createdAt) : now,
            updatedAt: payload.chat.updatedAt ? new Date(payload.chat.updatedAt) : now,
          })
        }
        else {
          const updates: Partial<schema.NewChat> = {
            updatedAt: payload.chat.updatedAt ? new Date(payload.chat.updatedAt) : now,
          }

          if (payload.chat.type)
            updates.type = payload.chat.type
          if (payload.chat.title !== undefined)
            updates.title = payload.chat.title

          await tx.update(schema.chats)
            .set(updates)
            .where(eq(schema.chats.id, chatId))
        }

        const desiredMembers: SyncChatMemberPayload[] = [
          { type: 'user', userId },
          ...members.filter(member => member.type !== 'user'),
        ]

        for (const member of desiredMembers) {
          if (member.type === 'user' && !member.userId)
            continue
          if (member.type === 'character' && !member.characterId)
            continue

          const existingMember = await tx.query.chatMembers.findFirst({
            where: and(
              eq(schema.chatMembers.chatId, chatId),
              eq(schema.chatMembers.memberType, member.type),
              member.type === 'user'
                ? eq(schema.chatMembers.userId, member.userId!)
                : eq(schema.chatMembers.characterId, member.characterId!),
            ),
          })

          if (!existingMember) {
            await tx.insert(schema.chatMembers).values({
              chatId,
              memberType: member.type,
              userId: member.type === 'user' ? member.userId : null,
              characterId: member.type === 'character' ? member.characterId : null,
            })
          }
        }

        if (payload.messages.length > 0) {
          const messageIds = payload.messages.map(m => m.id)
          const existingMessages = await tx
            .select({ id: schema.messages.id, chatId: schema.messages.chatId })
            .from(schema.messages)
            .where(inArray(schema.messages.id, messageIds))

          const conflicting = existingMessages.find(m => m.chatId !== chatId)
          if (conflicting)
            throw createConflictError('Message already belongs to another chat')

          await tx.insert(schema.messages)
            .values(payload.messages.map(message => ({
              id: message.id,
              chatId,
              senderId: resolveSenderId(message.role, userId, characterId),
              role: message.role,
              content: message.content,
              mediaIds: [] as string[],
              stickerIds: [] as string[],
              createdAt: message.createdAt ? new Date(message.createdAt) : now,
              updatedAt: now,
            })))
            .onConflictDoUpdate({
              target: schema.messages.id,
              set: {
                senderId: sql`excluded.sender_id`,
                role: sql`excluded.role`,
                content: sql`excluded.content`,
                updatedAt: sql`excluded.updated_at`,
              },
            })
        }

        return { chatId }
      })
    },
  }
}

export type ChatService = ReturnType<typeof createChatService>
