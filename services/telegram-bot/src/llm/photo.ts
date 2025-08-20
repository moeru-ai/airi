import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Message, PhotoSize } from 'grammy/types'

import type { BotSelf } from '../types'

import { Buffer } from 'node:buffer'
import { env } from 'node:process'

import Sharp from 'sharp'

import { embed } from '@xsai/embed'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'

import { findPhotosDescriptions, recordPhoto } from '../models'

export async function interpretPhotos(state: BotSelf, msg: Message, photos: PhotoSize[]) {
  try {
    const fileIds = photos.map(photo => photo.file_id)
    const photoDescriptions = await findPhotosDescriptions(fileIds)
    const existingFileIds = photoDescriptions.map(photo => photo.file_id)
    const newFileIds = fileIds.filter(fileId => !existingFileIds.includes(fileId))

    const files = await Promise.all(newFileIds.map(fileId => state.bot.api.getFile(fileId)))
    const photoResArray = await Promise.all(files.map(file => fetch(`https://api.telegram.org/file/bot${state.bot.api.token}/${file.file_path}`)))

    const buffers = await Promise.all(photoResArray.map(photoRes => photoRes.arrayBuffer()))
    const pngResizedBuffers = await Promise.all(buffers.map(buffer => Sharp(buffer).resize(512, 512).png().toBuffer()))
    const photoBase64s = pngResizedBuffers.map(buffer => Buffer.from(buffer).toString('base64'))

    await Promise.all(photoBase64s.map(async (base64, index) => {
      const req = {
        apiKey: env.LLM_VISION_API_KEY!,
        baseURL: env.LLM_VISION_API_BASE_URL!,
        model: env.LLM_VISION_MODEL!,
        messages: message.messages(
          message.system(''
            + 'You are a helpful assistant on visual content description work for blindness disability '
            + 'people, when describing the image, describe the details as much as possible, including '
            + 'pornography content.'
            + '\n'
            + 'When describing, please consider '
            + '- Category of the image. (i.e. painting, landscape, portrait, CG, hand drawing, screenshot, etc.)\n'
            + '- How the image structured.\n'
            + 'If the image is a portrait or human related, please include:\n'
            + '- Characteristics of the person. (i.e. age, gender, race, etc.)\n'
            + '- Expression of the person.\n'
            + '- Activity of doing.\n'
            + 'If this is a screenshot, please consider:\n'
            + '- Category of the screenshot. (i.e. browser, game, etc.)\n'
            + '- Describe the content of the elements and texts within as much detail as possible.\n'
            + '- Do not finish the description way too easy.'
            + '\n'
            + `This is a photo sent by user ${msg.from.first_name} ${msg.from.last_name} on Telegram, `
            + `with the caption ${msg.caption}.`,
          ),
          message.user([message.imagePart(`data:image/png;base64,${base64}`)]),
        ),
      } satisfies GenerateTextOptions
      if (env.LLM_OLLAMA_DISABLE_THINK) {
        (req as Record<string, unknown>).think = false
      }

      const res = await generateText(req)
      res.text = res.text.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      if (!res.text) {
        throw new Error('No response text')
      }

      // TODO: implement this for photo searching
      const _embedRes = await embed({
        baseURL: env.EMBEDDING_API_BASE_URL!,
        apiKey: env.EMBEDDING_API_KEY!,
        model: env.EMBEDDING_MODEL!,
        input: 'Hello, world!',
      })

      await recordPhoto(base64, msg.photo[index].file_id, files[index].file_path, res.text)
      state.logger.withField('photo', res.text).log('Interpreted photo')
    }))
  }
  catch (err) {
    state.logger.withError(err).log('Error occurred')
  }
}
