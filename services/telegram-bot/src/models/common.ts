import type { Message } from 'grammy/types'

import type { chatMessagesTable } from '../db/schema'

import { findPhotoDescription } from './photos'
import { findStickerDescription } from './stickers'

export function chatMessageToOneLine(botId: string, message: Omit<typeof chatMessagesTable.$inferSelect, 'content_vector_1536' | 'content_vector_768' | 'content_vector_1024'>, repliedToMessage?: Omit<typeof chatMessagesTable.$inferSelect, 'content_vector_1536' | 'content_vector_768' | 'content_vector_1024'>) {
  let userDisplayName = `User [${message.from_name}]`

  if (botId === message.from_id) {
    userDisplayName = 'Yourself'
  }

  if (message.is_reply) {
    if (repliedToMessage != null) {
      return `Message ID: ${message.platform_message_id || 'Unknown'} sent on ${new Date(message.created_at).toLocaleString()} ${userDisplayName} replied to ${repliedToMessage.from_name} with id ${repliedToMessage.platform_message_id} for content ${repliedToMessage.content} in same group said: ${message.content}`
    }

    return `Message ID: ${message.platform_message_id || 'Unknown'} sent on ${new Date(message.created_at).toLocaleString()} ${userDisplayName} replied to ${message.reply_to_name} with id ${message.reply_to_id} in same group said: ${message.content}`
  }

  return `Message ID: ${message.platform_message_id || 'Unknown'} sent on ${new Date(message.created_at).toLocaleString()} ${userDisplayName} sent in same group said: ${message.content}`
}

export async function telegramMessageToOneLine(botId: string, message: Message) {
  if (message == null) {
    return ''
  }

  const sentOn = new Date(message.date * 1000).toLocaleString()
  let userDisplayName = `User [Display name: ${message.from.first_name}${message.from?.last_name ? ` ${message.from.last_name}` : ''}${message.from?.username ? ` (username: ${message.from.username})` : ''}]`
  if (botId === message.from.id.toString()) {
    userDisplayName = 'Yourself'
  }

  if (message.sticker != null) {
    const description = await findStickerDescription(message.sticker.file_id)
    return `Message ID: ${message.message_id || 'Unknown'} sent on ${sentOn} ${userDisplayName} sent in Group [${message.chat.title}] a sticker, and description of the sticker is ${description}`
  }
  if (message.photo != null) {
    const description = await findPhotoDescription(message.photo[0].file_id)
    return `Message ID: ${message.message_id || 'Unknown'} sent on ${sentOn} ${userDisplayName} sent in Group [${message.chat.title}] a photo, and description of the photo is ${description}`
  }
  if (message.reply_to_message != null) {
    if (botId === message.reply_to_message.from.id.toString()) {
      return `Message ID: ${message.message_id || 'Unknown'} sent on ${sentOn} ${userDisplayName} replied to your previous message ${message.reply_to_message.text || message.reply_to_message.caption} in Group [${message.chat.title}] said: ${message.text}`
    }
    else {
      return `Message ID: ${message.message_id || 'Unknown'} sent on ${sentOn} ${userDisplayName} replied to User [${message.reply_to_message.from.first_name} ${message.reply_to_message.from.last_name} (${message.reply_to_message.from.username})] for content ${message.reply_to_message.text || message.reply_to_message.caption} in Group [${message.chat.title}] said: ${message.text}`
    }
  }

  return `Message ID: ${message.message_id || 'Unknown'} sent on ${sentOn} ${userDisplayName} sent in Group [${message.chat.title}] said: ${message.text}`
}
