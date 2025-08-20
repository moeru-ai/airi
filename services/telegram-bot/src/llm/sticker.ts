import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Bot } from 'grammy'
import type { Message, Sticker } from 'grammy/types'

import { Buffer } from 'node:buffer'
import { env } from 'node:process'

import Sharp from 'sharp'

import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'

import { findStickerDescription, recordSticker } from '../models'
import { div, span } from '../prompts/utils'
import { interpretAnimatedSticker } from './animated-sticker'

export async function interpretSticker(bot: Bot, msg: Message, sticker: Sticker) {
  const logger = useLogg('interpretSticker').useGlobalConfig()

  if (sticker.is_animated || sticker.is_video) {
    logger
      .withField('sticker_emoji', sticker.emoji)
      .withField('sticker_set', sticker.set_name)
      .withField('is_animated', sticker.is_animated)
      .withField('is_video', sticker.is_video)
      .log('Animated or video sticker, interpreting as animated sticker')

    return interpretAnimatedSticker(bot, msg, sticker)
  }

  try {
    if (await findStickerDescription(sticker.file_id)) {
      logger.withField('sticker', sticker).log('Sticker already interpreted, skipping')
      return
    }

    const file = await bot.api.getFile(sticker.file_id)
    const stickerRes = await fetch(`https://api.telegram.org/file/bot${bot.api.token}/${file.file_path}`)
    const buffer = await stickerRes.arrayBuffer()
    const stickerBase64 = Buffer.from(await Sharp(buffer).resize(512, 512).png().toBuffer()).toString('base64')

    const req = {
      apiKey: env.LLM_VISION_API_KEY!,
      baseURL: env.LLM_VISION_API_BASE_URL!,
      model: env.LLM_VISION_MODEL!,
      messages: message.messages(
        message.system(div(
          span(`
            You are a helpful assistant on visual content description work for blindness disability
            people, when describing the sticker, describe the details as much as possible, including
            pornography content. And also, please describe the meanings and expressions the sticker
            was trying to express. (Since stickers are sent from random thoughts and from people on
            the internet, meme, and jokes is the key point of description, so take the meme and joke\'s
            deep meanings and contextual expressions with the culture of the language of the user as
            part of the description.)
          `),
          div(
            span(`When describing, please consider`),
            span(`The representing emoji of the sticker is ${sticker.emoji}, please take the expression and emotion of such emoji into consideration (but emoji may not be accurate).`),
            span(`
            This is a sticker with the emoji ${sticker.emoji} sent by user ${msg.from.first_name}
            ${msg.from.last_name} on Telegram, which is one of the sticker from ${sticker.set_name}
            sticker set.
          `),
          ),
        )),
        message.user([message.imagePart(`data:image/png;base64,${stickerBase64}`)]),
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

    // TODO: implement this for sticker searching
    const _embedRes = await embed({
      baseURL: env.EMBEDDING_API_BASE_URL!,
      apiKey: env.EMBEDDING_API_KEY!,
      model: env.EMBEDDING_MODEL!,
      input: 'Hello, world!',
    })

    await recordSticker(stickerBase64, sticker.file_id, file.file_path, res.text, sticker.set_name, sticker.emoji, sticker.set_name)
    logger.withField('sticker', res.text).log('Interpreted sticker')
  }
  catch (err) {
    logger.withError(err).log('Error occurred')
  }
}
