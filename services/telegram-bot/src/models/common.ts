import type { Message } from 'grammy/types'
import type { chatMessagesTable } from '../db/schema'

import { findPhotoDescription } from './photos'
import { findStickerDescription } from './stickers'

export function chatMessageToOneLine(message: typeof chatMessagesTable.$inferSelect) {
  if (message.isReply) {
    return `${new Date(message.createdAt).toLocaleString()} User ${message.fromName} replied to ${message.replyToName} in same group said: ${message.content}`
  }

  return `${new Date(message.createdAt).toLocaleString()} User ${message.fromName} sent in same group said: ${message.content}`
}

export async function telegramMessageToOneLine(message: Message) {
  if (message == null) {
    return ''
  }
  if (message.sticker != null) {
    const description = await findStickerDescription(message.sticker.file_id)
    return `${new Date(message.date * 1000).toLocaleString()} User [${message.from.first_name}] sent in Group [${message.chat.title}] a sticker, and content of sticker is ${description}`
  }
  if (message.photo != null) {
    const description = await findPhotoDescription(message.photo[0].file_id)
    return `${new Date(message.date * 1000).toLocaleString()} User [${message.from.first_name}] sent in Group [${message.chat.title}] a photo, and content of photo is ${description}`
  }
  if (message.reply_to_message != null) {
    return `${new Date(message.date * 1000).toLocaleString()} User [${message.from.first_name}] replied to [${message.reply_to_message.from.first_name}] in Group [${message.chat.title}] said: ${message.text}`
  }

  return `${new Date(message.date * 1000).toLocaleString()} User [${message.from.first_name}] sent in Group [${message.chat.title}] said: ${message.text}`
}
