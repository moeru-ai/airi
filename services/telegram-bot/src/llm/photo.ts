import type { Message, PhotoSize } from 'grammy/types'
import type { BotSelf } from '../types'
import { Buffer } from 'node:buffer'
import generateText from '@xsai/generate-text'
import { imagePart, messages, system, user } from '@xsai/shared-chat'
import Sharp from 'sharp'
import { findPhotosDescriptions, recordPhoto } from '../models'
import { openAI } from './providers'

export async function interpretPhotos(state: BotSelf, message: Message, photos: PhotoSize[]) {
  try {
    const fileIds = photos.map(photo => photo.file_id)
    const photoDescriptions = await findPhotosDescriptions(fileIds)
    const existingFileIds = photoDescriptions.map(photo => photo.fileId)
    const newFileIds = fileIds.filter(fileId => !existingFileIds.includes(fileId))

    const files = await Promise.all(newFileIds.map(fileId => state.bot.api.getFile(fileId)))
    const photoResArray = await Promise.all(files.map(file => fetch(`https://api.telegram.org/file/bot${state.bot.api.token}/${file.file_path}`)))

    const buffers = await Promise.all(photoResArray.map(photoRes => photoRes.arrayBuffer()))
    const pngResizedBuffers = await Promise.all(buffers.map(buffer => Sharp(buffer).resize(512, 512).png().toBuffer()))
    const photoBase64s = pngResizedBuffers.map(buffer => Buffer.from(buffer).toString('base64'))

    await Promise.all(photoBase64s.map(async (base64, index) => {
      const res = await generateText({
        ...openAI.chat('openai/gpt-4o'),
        messages: messages(
          system(`This is a photo sent by user ${message.from.first_name} ${message.from.last_name} on Telegram, with the caption ${message.caption} Please describe what do you see in this photo.`),
          user([imagePart(`data:image/png;base64,${base64}`)]),
        ),
      })

      await recordPhoto(base64, message.sticker.file_id, files[index].file_path, res.text)
      state.logger.withField('photo', res.text).log('Interpreted photo')
    }))
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
}
