import type { EmbedResult } from '@xsai/embed'
import type { SQL } from 'drizzle-orm'
import type { Message, UserFromGetMe } from 'grammy/types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'
import { and, cosineDistance, desc, eq, gt, inArray, lt, ne, notInArray, sql } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { chatMessagesTable } from '../db/schema'
import { chatMessageToOneLine } from './common'
import { findPhotoDescription } from './photos'
import { findStickerDescription } from './stickers'

export async function recordMessage(botInfo: UserFromGetMe, message: Message) {
  const replyToName = message.reply_to_message?.from.first_name || ''

  let embedding: EmbedResult
  let text: string

  if (message.sticker != null) {
    text = `A sticker sent by user ${await findStickerDescription(message.sticker.file_id)}, sticker set named ${message.sticker.set_name}`
  }
  else if (message.photo != null) {
    text = `A set of photo, descriptions are: ${(await Promise.all(message.photo.map(photo => findPhotoDescription(photo.file_id)))).join('\n')}`
  }
  else if (message.text) {
    text = message.text || message.caption || ''
  }

  if (text === '') {
    return
  }
  else {
    embedding = await embed({
      baseURL: env.EMBEDDING_API_BASE_URL!,
      apiKey: env.EMBEDDING_API_KEY!,
      model: env.EMBEDDING_MODEL!,
      input: text,
    })
  }

  const values: Partial<Omit<typeof chatMessagesTable.$inferSelect, 'id' | 'created_at' | 'updated_at'>> = {
    platform: 'telegram',
    from_id: message.from.id.toString(),
    platform_message_id: message.message_id.toString(),
    from_name: message.from.first_name,
    in_chat_id: message.chat.id.toString(),
    content: text,
    is_reply: !!message.reply_to_message,
    reply_to_name: replyToName === botInfo.first_name ? 'Yourself' : replyToName,
    reply_to_id: message.reply_to_message?.message_id.toString() || '',
  }

  switch (env.EMBEDDING_DIMENSION) {
    case '1536':
      values.content_vector_1536 = embedding.embedding
      break
    case '1024':
      values.content_vector_1024 = embedding.embedding
      break
    case '768':
      values.content_vector_768 = embedding.embedding
      break
    default:
      throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
  }

  await useDrizzle()
    .insert(chatMessagesTable)
    .values(values)
}

export async function findLastNMessages(chatId: string, n: number) {
  const res = await useDrizzle()
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.in_chat_id, chatId))
    .orderBy(desc(chatMessagesTable.created_at))
    .limit(n)

  return res.reverse()
}

export async function findRelevantMessages(botId: string, chatId: string, unreadHistoryMessagesEmbedding: { embedding: number[] }[], excludeMessageIds: string[] = []) {
  const db = useDrizzle()
  const contextWindowSize = 5 // Number of messages to include before and after
  const logger = useLogg('findRelevantMessages').useGlobalConfig().withField('chatId', chatId)

  logger.withField('context_window_size', contextWindowSize).log('Querying relevant chat messages...')

  return await Promise.all(unreadHistoryMessagesEmbedding.map(async (embedding) => {
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
        platform_message_id: chatMessagesTable.platform_message_id,
        from_id: chatMessagesTable.from_id,
        from_name: chatMessagesTable.from_name,
        in_chat_id: chatMessagesTable.in_chat_id,
        content: chatMessagesTable.content,
        is_reply: chatMessagesTable.is_reply,
        reply_to_name: chatMessagesTable.reply_to_name,
        reply_to_id: chatMessagesTable.reply_to_id,
        created_at: chatMessagesTable.created_at,
        updated_at: chatMessagesTable.updated_at,
        similarity: sql`${similarity} AS "similarity"`,
        time_relevance: sql`${timeRelevance} AS "time_relevance"`,
        combined_score: sql`${combinedScore} AS "combined_score"`,
      })
      .from(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.platform, 'telegram'),
        eq(chatMessagesTable.in_chat_id, chatId),
        gt(similarity, 0.5),
        notInArray(chatMessagesTable.platform_message_id, excludeMessageIds),
      ))
      .orderBy(desc(sql`combined_score`))
      .limit(3)

    logger.withField('number_of_relevant_messages', relevantMessages.length).log('Successfully found relevant chat messages')

    // Now fetch the context for each message
    const relevantMessagesContext = await Promise.all(
      relevantMessages.map(async (message) => {
        // Get N messages before the target message
        const messagesBefore = await db
          .select({
            id: chatMessagesTable.id,
            platform: chatMessagesTable.platform,
            platform_message_id: chatMessagesTable.platform_message_id,
            from_id: chatMessagesTable.from_id,
            from_name: chatMessagesTable.from_name,
            in_chat_id: chatMessagesTable.in_chat_id,
            content: chatMessagesTable.content,
            is_reply: chatMessagesTable.is_reply,
            reply_to_name: chatMessagesTable.reply_to_name,
            reply_to_id: chatMessagesTable.reply_to_id,
            created_at: chatMessagesTable.created_at,
            updated_at: chatMessagesTable.updated_at,
          })
          .from(chatMessagesTable)
          .where(and(
            eq(chatMessagesTable.platform, 'telegram'),
            eq(chatMessagesTable.in_chat_id, message.in_chat_id),
            lt(chatMessagesTable.created_at, message.created_at),
            notInArray(chatMessagesTable.platform_message_id, excludeMessageIds),
          ))
          .orderBy(desc(chatMessagesTable.created_at))
          .limit(contextWindowSize)

        // Get N messages after the target message
        const messagesAfter = await db
          .select({
            id: chatMessagesTable.id,
            platform: chatMessagesTable.platform,
            platform_message_id: chatMessagesTable.platform_message_id,
            from_id: chatMessagesTable.from_id,
            from_name: chatMessagesTable.from_name,
            in_chat_id: chatMessagesTable.in_chat_id,
            content: chatMessagesTable.content,
            is_reply: chatMessagesTable.is_reply,
            reply_to_name: chatMessagesTable.reply_to_name,
            reply_to_id: chatMessagesTable.reply_to_id,
            created_at: chatMessagesTable.created_at,
            updated_at: chatMessagesTable.updated_at,
          })
          .from(chatMessagesTable)
          .where(and(
            eq(chatMessagesTable.platform, 'telegram'),
            eq(chatMessagesTable.in_chat_id, message.in_chat_id),
            gt(chatMessagesTable.created_at, message.created_at),
            notInArray(chatMessagesTable.platform_message_id, excludeMessageIds),
          ))
          .orderBy(chatMessagesTable.created_at)
          .limit(contextWindowSize)

        // Combine all messages in chronological order
        return [
          ...messagesBefore.reverse(), // Reverse to get chronological order
          message,
          ...messagesAfter,
        ]
      }),
    )

    // Convert from
    //
    // [
    //   [
    //     { is_reply: true, reply_to_id: '123' },
    //     { is_reply: false, reply_to_id: '124' }
    //   ]
    // ]
    //
    // to
    //
    // [['123', '124']]
    const repliedMessageIDsSubset = relevantMessagesContext.map(msgs => msgs.filter(m => m.is_reply).map(m => m.reply_to_id))
    // Convert from
    //
    // [['123', '124']]
    //
    // to
    //
    // ['123', '124']
    //
    // with unique values
    const repliedMessageIDs = [...new Set(repliedMessageIDsSubset.flat())]
    const repliedMessages = await findMessagesByIDs(repliedMessageIDs)

    // Queried results
    //
    // { '123': { ... }, '124': { ... } }
    const repliedMessagesSet = new Map(repliedMessages.map(m => [m.platform_message_id, m]))

    // Map into one liners
    const relevantMessageOneliner = relevantMessagesContext.map(msgs => msgs.map(m => chatMessageToOneLine(botId, m, repliedMessagesSet.get(m.reply_to_id))).join('\n'))
    logger.withField('number_of_relevant_messages', relevantMessages.length).log('processed relevant chat messages with contextual messages')

    return relevantMessageOneliner
  }))
}

export async function findMessagesByIDs(messageIds: string[]) {
  const db = useDrizzle()

  return await db
    .select()
    .from(chatMessagesTable)
    .where(
      and(
        inArray(chatMessagesTable.platform_message_id, messageIds),
        eq(chatMessagesTable.platform, 'telegram'),
        ne(chatMessagesTable.platform_message_id, ''),
      ),
    )
}
