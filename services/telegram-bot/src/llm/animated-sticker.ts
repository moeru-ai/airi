import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Bot } from 'grammy'
import type { Message, Sticker } from 'grammy/types'

import os from 'node:os'
import path from 'node:path'

import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { env } from 'node:process'

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffmpeg from 'fluent-ffmpeg'
import Sharp from 'sharp'

import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'

import { findStickerDescription, recordSticker } from '../models'
import { div, span, ul } from '../prompts/utils'

// Set path to FFmpeg binaries
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

async function extractFrames(inputFilePath, outputDir, frameRate = 5) {
  await fs.mkdir(outputDir, { recursive: true })
  const outputPattern = path.join(outputDir, 'frame-%03d.png')

  return new Promise<string[]>((resolve, reject) => {
    ffmpeg(inputFilePath)
      .outputOptions(`-vf fps=${frameRate}`)
      .output(outputPattern)
      .on('end', async () => {
        const files = await fs.readdir(outputDir)
        const sortedFiles = files
          .filter(file => file.match(/frame-\d+\.png/))
          .sort((a, b) => {
            const numA = Number.parseInt(a.match(/frame-(\d+)\.png/)[1])
            const numB = Number.parseInt(b.match(/frame-(\d+)\.png/)[1])
            return numA - numB
          })
        resolve(sortedFiles.map(file => path.join(outputDir, file)))
      })
      .on('error', err => reject(err))
      .run()
  })
}

export async function interpretAnimatedSticker(bot: Bot, msg: Message, sticker: Sticker) {
  const logger = useLogg('interpretAnimatedSticker')
    .useGlobalConfig()
    .withField('sticker_id', sticker.file_id)
    .withField('sticker_emoji', sticker.emoji)
    .withField('sticker_set', sticker.set_name)

  try {
    if (await findStickerDescription(sticker.file_id)) {
      logger.log('Sticker already interpreted, skipping')
      return
    }

    const file = await bot.api.getFile(sticker.file_id)
    const stickerRes = await fetch(`https://api.telegram.org/file/bot${bot.api.token}/${file.file_path}`)
    const buffer = await stickerRes.arrayBuffer()

    // Create temp directory for sticker and frames
    const tempDir = path.join(os.tmpdir(), `sticker-${sticker.file_id}`)
    const framesDir = path.join(tempDir, 'frames')
    await fs.mkdir(tempDir, { recursive: true })
    await fs.mkdir(framesDir, { recursive: true })

    // Save sticker to temp file
    const stickerPath = path.join(tempDir, path.basename(file.file_path))
    await fs.writeFile(stickerPath, Buffer.from(buffer))

    logger.withField('sticker_path', stickerPath).log('Sticker saved to temp file')

    const framePaths = await extractFrames(stickerPath, framesDir, 15)
    logger.withField('frame_paths', framePaths).log('Frames extracted')

    // Sample frames if too many (limit to ~5-8 frames for processing)
    let sampled = framePaths
    if (framePaths.length > 8) {
      const samplingRate = Math.ceil(framePaths.length / 8)
      sampled = framePaths.filter((_, i) => i % samplingRate === 0)
    }
    logger.withField('sampled', sampled).log('Sampled frames')

    // Process frames with Sharp
    const frames = await Promise.all(sampled.map(async (framePath, index) => {
      const frameBuffer = await Sharp(framePath)
        .resize(512, 512)
        .png()
        .toBuffer()
      return {
        index,
        buffer: frameBuffer,
        base64: Buffer.from(frameBuffer).toString('base64'),
      }
    }))
    logger.withField('sampled_frames', sampled).log('Normalized the frames')

    // STAGE 1: Process each frame individually
    const frameDescriptions = []
    for (const frame of frames) {
      try {
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
              span(`This is frame ${frame.index + 1} in the sequence.`),
              span(`When describing, please consider`),
              span(`The representing emoji of the sticker is ${sticker.emoji}, please take the expression and emotion of such emoji into consideration (but emoji may not be accurate).`),
              span(`
                This is a sticker with the emoji ${sticker.emoji} sent by user ${msg.from.first_name}
                ${msg.from.last_name} on Telegram, which is one of the sticker from ${sticker.set_name}
                sticker set.
              `),
            )),
            message.user([message.imagePart(`data:image/png;base64,${frame.base64}`)]),
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

        frameDescriptions.push({
          frameNumber: frame.index + 1,
          description: res.text,
        })
      }
      catch (err) {
        logger.withError(err).log(`Failed to process frame ${frame.index + 1}`)
        // Continue with other frames
      }
    }

    logger.withField('frames', frameDescriptions.length).log('Processed all frames')

    // Only proceed to consolidation if we have at least some frames
    if (frameDescriptions.length === 0) {
      throw new Error('Failed to process any frames from the animated sticker')
    }

    // STAGE 2: Consolidate descriptions with a text-only LLM call
    logger.log('Consolidating frames')

    const req = {
      apiKey: env.LLM_API_KEY!, // Using text-only LLM API
      baseURL: env.LLM_API_BASE_URL!,
      model: env.LLM_MODEL!,
      messages: message.messages(
        message.system(
          div(
            ul(
              span(`The representing emoji of the sticker is ${sticker.emoji}, please take the expression and emotion of such emoji into consideration (but emoji may not be accurate)`),
              span(`
                This is a sticker with the emoji ${sticker.emoji} sent by user ${msg.from.first_name}
                ${msg.from.last_name} on Telegram, which is one of the sticker from ${sticker.set_name}
                sticker set.
              `),
            ),
            div(
              span(`You are analyzing an animated sticker from Telegram.`),
              span(`Below are descriptions of ${frameDescriptions.length} sequential frames from this animated sticker:`),
              div(
                ...frameDescriptions.map(fd => `FRAME ${fd.frameNumber}:\n${fd.description}\n`).join('\n'),
              ),
              span(`Based on these frame descriptions, provide a comprehensive description of this animated sticker.`),
              span(`Focus on:`),
              ul(
                '1. What is being depicted overall',
                '2. How the animation progresses (the movement/action)',
                '3. The emotion or message the sticker is conveying',
                '4. The visual style and notable characteristics',
                '5. How this relates to the emoji ${sticker.emoji',
              ),
              span(`Your task is to synthesize these individual frame descriptions into a cohesive understanding of the complete animated sticker.`),
            ),
          ),
        ),
      ),
    } satisfies GenerateTextOptions
    if (env.LLM_OLLAMA_DISABLE_THINK) {
      (req as Record<string, unknown>).think = false
    }

    const consolidatedResult = await generateText(req)

    // Clean up temp files
    await fs.rm(tempDir, { recursive: true, force: true })

    logger.withField('consolidated_result', consolidatedResult.text).log('Animated sticker interpreted')

    // Store the result - using first frame as thumbnail
    await recordSticker(frames[0].base64, sticker.file_id, file.file_path, consolidatedResult.text, sticker.set_name, sticker.emoji, sticker.set_name)
    logger.withField('sticker', consolidatedResult.text).log('Interpreted animated sticker')

    return consolidatedResult.text
  }
  catch (err) {
    logger.withError(err).log('Error interpreting animated sticker')
  }
}
