import type { Bot } from 'grammy'
import type { Message, Sticker } from 'grammy/types'

import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { env } from 'node:process'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import ffmpeg from 'fluent-ffmpeg'
import Sharp from 'sharp'

import { findStickerDescription, recordSticker } from '../models'
import { span } from '../prompts/utils'

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
        const res = await generateText({
          apiKey: env.LLM_VISION_API_KEY!,
          baseURL: env.LLM_VISION_API_BASE_URL!,
          model: env.LLM_VISION_MODEL!,
          messages: message.messages(
            message.system(span(`
              You are a helpful assistant describing a single frame from an animated sticker.
              Focus only on describing what you see in this specific frame.
              Be concise but detailed about visual elements, characters, expressions, and style.
              This is frame ${frame.index + 1} in the sequence.
            `)),
            message.user([message.imagePart(`data:image/png;base64,${frame.base64}`)]),
          ),
        })

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
    const consolidationPrompt = span(`
      You are analyzing an animated sticker from Telegram.
      The emoji associated with this sticker is: ${msg.sticker.emoji}
      This sticker is from the set named: "${msg.sticker.set_name}"

      Below are descriptions of ${frameDescriptions.length} sequential frames from this animated sticker:

      ${frameDescriptions.map(fd => `FRAME ${fd.frameNumber}:\n${fd.description}\n`).join('\n')}

      Based on these frame descriptions, provide a comprehensive description of this animated sticker.
      Focus on:
      1. What is being depicted overall
      2. How the animation progresses (the movement/action)
      3. The emotion or message the sticker is conveying
      4. The visual style and notable characteristics
      5. How this relates to the emoji ${msg.sticker.emoji}

      Your task is to synthesize these individual frame descriptions into a cohesive understanding of the complete animated sticker.
    `)

    logger.log('Consolidating frames')

    const consolidatedResult = await generateText({
      apiKey: env.LLM_API_KEY!, // Using text-only LLM API
      baseURL: env.LLM_API_BASE_URL!,
      model: env.LLM_MODEL!,
      messages: message.messages(
        message.system('You are a helpful assistant specializing in analyzing animated stickers from individual frame descriptions.'),
        message.user(consolidationPrompt),
      ),
    })

    // Clean up temp files
    await fs.rm(tempDir, { recursive: true, force: true })

    logger.withField('consolidated_result', consolidatedResult.text).log('Animated sticker interpreted')

    // Store the result - using first frame as thumbnail
    await recordSticker(frames[0].base64, msg.sticker.file_id, file.file_path, consolidatedResult.text)
    logger.withField('sticker', consolidatedResult.text).log('Interpreted animated sticker')

    return consolidatedResult.text
  }
  catch (err) {
    logger.withError(err).log('Error interpreting animated sticker')
  }
}
