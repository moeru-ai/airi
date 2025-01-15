import type { Message } from 'grammy/types'
import type { BotSelf } from '../types'
import { Buffer } from 'node:buffer'
import generateText from '@xsai/generate-text'
import { imagePart, messages, system, user } from '@xsai/shared-chat'
import Sharp from 'sharp'
import { findStickerDescription, recordSticker } from '../models'
import { openAI } from './providers'

export async function interpretSticker(state: BotSelf, message: Message) {
  try {
    if (await findStickerDescription(message.sticker.file_id)) {
      return
    }

    const file = await state.bot.api.getFile(message.sticker.file_id)
    const stickerRes = await fetch(`https://api.telegram.org/file/bot${state.bot.api.token}/${file.file_path}`)
    const buffer = await stickerRes.arrayBuffer()
    const stickerBase64 = Buffer.from(await Sharp(buffer).resize(512, 512).png().toBuffer()).toString('base64')

    const res = await generateText({
      ...openAI.chat('openai/gpt-4o'),
      messages: messages(
        system(`This is a sticker sent by user ${message.from.first_name} ${message.from.last_name} on Telegram, which is one of the sticker from ${message.sticker.set_name} sticker set. Please describe what do you see in this sticker.`),
        user([imagePart(`data:image/png;base64,${stickerBase64}`)]),
      ),
    })

    await recordSticker(stickerBase64, message.sticker.file_id, file.file_path, res.text)
    state.logger.withField('sticker', res.text).log('Interpreted sticker')
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
}
