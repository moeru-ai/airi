import type { Bot } from 'grammy'
import type { Message } from 'grammy/types'
import type { chatMessagesTable } from '../db/schema'

import { findPhotoDescription } from './photos'
import { findStickerDescription } from './stickers'

export function chatMessageToOneLine(bot: Bot, message: Omit<typeof chatMessagesTable.$inferSelect, 'content_vector_1536' | 'content_vector_768' | 'content_vector_1024'>) {
  let userDisplayName = `User [${message.from_name}]`

  if (bot.botInfo.id.toString() === message.from_id) {
    userDisplayName = 'Yourself'
  }

  if (message.is_reply) {
    return `${new Date(message.created_at).toLocaleString()} ${userDisplayName} replied to ${message.reply_to_name} in same group said: ${message.content}`
  }

  return `${new Date(message.created_at).toLocaleString()} ${userDisplayName} sent in same group said: ${message.content}`
}

export async function telegramMessageToOneLine(bot: Bot, message: Message) {
  if (message == null) {
    return ''
  }

  let userDisplayName = `User [${message.from.first_name} ${message.from.last_name} (${message.from.username})]`
  if (bot.botInfo.id.toString() === message.from.id.toString()) {
    userDisplayName = 'Yourself'
  }

  if (message.sticker != null) {
    const description = await findStickerDescription(message.sticker.file_id)
    return `${new Date(message.date * 1000).toLocaleString()} ${userDisplayName} sent in Group [${message.chat.title}] a sticker, and description of the sticker is ${description}`
  }
  if (message.photo != null) {
    const description = await findPhotoDescription(message.photo[0].file_id)
    return `${new Date(message.date * 1000).toLocaleString()} ${userDisplayName} sent in Group [${message.chat.title}] a photo, and description of the photo is ${description}`
  }
  if (message.reply_to_message != null) {
    if (bot.botInfo.username === message.reply_to_message.from.username) {
      return `${new Date(message.date * 1000).toLocaleString()} ${userDisplayName} replied to your previous message ${message.reply_to_message.text || message.caption} in Group [${message.chat.title}] said: ${message.text}`
    }
    else {
      return `${new Date(message.date * 1000).toLocaleString()} ${userDisplayName} replied to User [${message.reply_to_message.from.first_name} ${message.reply_to_message.from.last_name} (${message.reply_to_message.from.username})] in Group [${message.chat.title}] said: ${message.text}`
    }
  }

  return `${new Date(message.date * 1000).toLocaleString()} ${userDisplayName} sent in Group [${message.chat.title}] said: ${message.text}`
}
