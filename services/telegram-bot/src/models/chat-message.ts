import type { EmbedResult } from '@xsai/embed'
import type { Message, UserFromGetMe } from 'grammy/types'

import { env } from 'node:process'
import { embed } from '@xsai/embed'
import { desc, eq } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { chatMessagesTable } from '../db/schema'
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
    from_name: message.from.first_name,
    in_chat_id: message.chat.id.toString(),
    content: text,
    is_reply: !!message.reply_to_message,
    reply_to_name: replyToName === botInfo.first_name ? 'Yourself' : replyToName,
  }

  switch (env.EMBEDDING_DIMENSION) {
    case '1536':
      values.content_vector_1536 = embedding?.embedding
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
  return await useDrizzle()
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.in_chat_id, chatId))
    .orderBy(desc(chatMessagesTable.created_at))
    .limit(n)
}
