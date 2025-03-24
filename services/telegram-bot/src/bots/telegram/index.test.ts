import type { SQL } from 'drizzle-orm'

import { env } from 'node:process'
import { embed } from '@xsai/embed'
import { cosineDistance, desc, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { initDb, useDrizzle } from '../../db'
import { chatMessagesTable } from '../../db/schema'
import { chatMessageToOneLine } from '../../models'

beforeAll(async () => {
  await initDb()
})

describe.todo('telegram bot', { timeout: 30000 }, async () => {
  it('should be able to run', async () => {
    const db = useDrizzle()
    const contextWindowSize = 5 // Number of messages to include before and after

    const embedding = await embed({
      baseURL: env.EMBEDDING_API_BASE_URL!,
      apiKey: env.EMBEDDING_API_KEY!,
      model: env.EMBEDDING_MODEL!,
      input: '测试一下行不行',
    })
      .then(res => res)
      .catch((err) => {
        console.error(err, err.cause)
        return { embedding: [] }
      })
    if (embedding.embedding.length === 0) {
      throw new Error('Failed to embed the input')
    }

    const relevantChatMessages = await Promise.all([embedding].map(async (embedding) => {
      let similarity: SQL<number>

      switch (env.EMBEDDING_DIMENSION) {
        case '1536':
          similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1536, embedding.embedding)}))`
          break
        case '1024':
          similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_1024, embedding.embedding)}))`
          break
        case '768':
          similarity = sql<number>`(1 - (${cosineDistance(chatMessagesTable.content_vector_768, embedding.embedding)}))`
          break
        default:
          throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
      }

      const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${chatMessagesTable.created_at}) / 86400 / 30)`
      const combinedScore = sql<number>`((1.2 * ${similarity}) + (0.2 * ${timeRelevance}))`

      // Get top messages with similarity above threshold
      const relevantMessages = await db
        .select({
          id: chatMessagesTable.id,
          platform: chatMessagesTable.platform,
          from_id: chatMessagesTable.from_id,
          from_name: chatMessagesTable.from_name,
          in_chat_id: chatMessagesTable.in_chat_id,
          content: chatMessagesTable.content,
          is_reply: chatMessagesTable.is_reply,
          reply_to_name: chatMessagesTable.reply_to_name,
          created_at: chatMessagesTable.created_at,
          updated_at: chatMessagesTable.updated_at,
          similarity: sql`${similarity} AS "similarity"`,
          time_relevance: sql`${timeRelevance} AS "time_relevance"`,
          combined_score: sql`${combinedScore} AS "combined_score"`,
        })
        .from(chatMessagesTable)
        .where(sql`${similarity} > '0.5'`)
        .orderBy(desc(sql`combined_score`))
        .limit(3)

      // Now fetch the context for each message
      return await Promise.all(
        relevantMessages.map(async (message) => {
          // Get N messages before the target message
          const messagesBefore = await db
            .select({
              id: chatMessagesTable.id,
              platform: chatMessagesTable.platform,
              from_id: chatMessagesTable.from_id,
              from_name: chatMessagesTable.from_name,
              in_chat_id: chatMessagesTable.in_chat_id,
              content: chatMessagesTable.content,
              is_reply: chatMessagesTable.is_reply,
              reply_to_name: chatMessagesTable.reply_to_name,
              created_at: chatMessagesTable.created_at,
              updated_at: chatMessagesTable.updated_at,
            })
            .from(chatMessagesTable)
            .where(sql`${chatMessagesTable.in_chat_id} = ${message.in_chat_id} AND
                      ${chatMessagesTable.created_at} < ${message.created_at}`)
            .orderBy(desc(chatMessagesTable.created_at))
            .limit(contextWindowSize)

          // Get N messages after the target message
          const messagesAfter = await db
            .select({
              id: chatMessagesTable.id,
              platform: chatMessagesTable.platform,
              from_id: chatMessagesTable.from_id,
              from_name: chatMessagesTable.from_name,
              in_chat_id: chatMessagesTable.in_chat_id,
              content: chatMessagesTable.content,
              is_reply: chatMessagesTable.is_reply,
              reply_to_name: chatMessagesTable.reply_to_name,
              created_at: chatMessagesTable.created_at,
              updated_at: chatMessagesTable.updated_at,
            })
            .from(chatMessagesTable)
            .where(sql`${chatMessagesTable.in_chat_id} = ${message.in_chat_id} AND
                      ${chatMessagesTable.created_at} > ${message.created_at}`)
            .orderBy(chatMessagesTable.created_at)
            .limit(contextWindowSize)

          // Combine all messages in chronological order
          const contextMessages = [
            ...messagesBefore.reverse(), // Reverse to get chronological order
            message,
            ...messagesAfter,
          ]

          // eslint-disable-next-line no-console
          console.log(contextMessages)

          const contextMessagesOneliner = (await Promise.all(contextMessages.map(m => chatMessageToOneLine(m))))
          return `One of the relevant message along with the context:\n${contextMessagesOneliner}`
        }),
      )
    }))

    // eslint-disable-next-line no-console
    console.log(relevantChatMessages)

    expect(relevantChatMessages.length).toBe(1)
  })
})
