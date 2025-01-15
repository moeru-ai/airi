import type { Message, UserFromGetMe } from 'grammy/types'

import { useDrizzle } from '../db'
import { chatMessagesTable } from '../db/schema'
import { findPhotoDescription } from './photos'
import { findStickerDescription } from './stickers'

export async function recordMessage(botInfo: UserFromGetMe, message: Message) {
  const replyToName = message.reply_to_message?.from.first_name || ''
  let text = message.text || ''
  if (message.sticker != null) {
    text = `A sticker sent by user ${await findStickerDescription(message.sticker.file_id)}, sticker set named ${message.sticker.set_name}`
  }
  else if (message.photo != null) {
    text = `A set of photo, descriptions are: ${(await Promise.all(message.photo.map(photo => findPhotoDescription(photo.file_id)))).join('\n')}`
  }
  if (text === '') {
    return
  }

  await useDrizzle()
    .insert(chatMessagesTable)
    .values({
      platform: 'telegram',
      fromId: message.from.id.toString(),
      fromName: message.from.first_name,
      inChatId: message.chat.id.toString(),
      content: text,
      isReply: !!message.reply_to_message,
      replyToName: replyToName === botInfo.first_name ? 'Yourself' : replyToName,
    })
}
