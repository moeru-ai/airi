import type { InferOutput } from 'valibot'

import type { SyncChatSessionsSchema } from '../api/chat-sessions.schema'
import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { and, desc, eq, gt, isNull } from 'drizzle-orm'

import * as schema from '../schemas/chat-sessions'

type SyncInput = InferOutput<typeof SyncChatSessionsSchema>

export function createChatSessionService(db: Database<typeof fullSchema>) {
  return {
    async syncSessions(userId: string, input: SyncInput) {
      return await db.transaction(async (tx) => {
        const results = []

        for (const session of input.sessions) {
          // 1. Upsert Session Meta
          const [syncedSession] = await tx.insert(schema.chatSessions)
            .values({
              ...session.meta,
              userId,
              updatedAt: session.meta.updatedAt || new Date(),
            })
            .onConflictDoUpdate({
              target: schema.chatSessions.id,
              set: {
                title: session.meta.title,
                updatedAt: session.meta.updatedAt || new Date(),
              },
            })
            .returning()

          // 2. Upsert Messages (Append-only / Idempotent)
          if (session.messages.length > 0) {
            await tx.insert(schema.chatMessages)
              .values(session.messages.map(msg => ({
                ...msg,
                sessionId: syncedSession.id,
                userId,
                raw: msg.raw as any,
              })))
              .onConflictDoNothing({ target: schema.chatMessages.id })
          }

          results.push(syncedSession)
        }

        return results
      })
    },

    async getSessions(userId: string, query: { updatedAfter?: Date, characterId?: string, limit?: number }) {
      const whereClause = and(
        eq(schema.chatSessions.userId, userId),
        isNull(schema.chatSessions.deletedAt),
        query.characterId ? eq(schema.chatSessions.characterId, query.characterId) : undefined,
        query.updatedAfter ? gt(schema.chatSessions.updatedAt, query.updatedAfter) : undefined,
      )

      return await db.query.chatSessions.findMany({
        where: whereClause,
        orderBy: [desc(schema.chatSessions.updatedAt)],
        limit: query.limit || 50,
      })
    },

    async getSession(userId: string, sessionId: string) {
      return await db.query.chatSessions.findFirst({
        where: and(
          eq(schema.chatSessions.id, sessionId),
          eq(schema.chatSessions.userId, userId),
          isNull(schema.chatSessions.deletedAt),
        ),
        with: {
          messages: {
            orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
          },
        },
      })
    },

    async exportRagData(userId: string, sessionId: string) {
      const session = await this.getSession(userId, sessionId)
      if (!session)
        return null

      return {
        sessionId: session.id,
        characterId: session.characterId,
        messages: session.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      }
    },
  }
}

export type ChatSessionService = ReturnType<typeof createChatSessionService>
