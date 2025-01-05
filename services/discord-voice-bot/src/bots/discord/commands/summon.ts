import type { AudioReceiveStream } from '@discordjs/voice'
import type { useLogg } from '@guiiai/logg'
import type { CacheType, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { Readable } from 'node:stream'
import { createAudioPlayer, createAudioResource, EndBehaviorType, entersState, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice'
import { generateSpeech } from '@xsai/generate-speech'
import { generateText } from '@xsai/generate-text'
import { createOpenAI, createUnElevenLabs } from '@xsai/providers'
import { message } from '@xsai/shared-chat'
import { formatDate } from 'date-fns'
import ffmpeg from 'fluent-ffmpeg'
import OpusScript from 'opusscript'
import wavefile from 'wavefile'

import { WhisperLargeV3Pipeline } from '../../../pipelines/tts'
import { systemPrompt } from '../../../prompts/system-v1'
import { exists } from '../../../utils/fs'

const decoder = new OpusScript(48000, 2)

export async function handleSummon(log: ReturnType<typeof useLogg>, interaction: ChatInputCommandInteraction<CacheType>) {
  const currVoiceChannel = (interaction.member as GuildMember).voice.channel
  if (!currVoiceChannel) {
    return await interaction.reply('Please join a voice channel first.')
  }

  try {
    const connection = joinVoiceChannel({
      channelId: currVoiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    })

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    })

    connection.subscribe(player)

    connection.on(VoiceConnectionStatus.Signalling, async () => {
      log.log('Connection is signalling')
    })

    connection.on(VoiceConnectionStatus.Connecting, async () => {
      log.log('Connection is connecting')
    })

    connection.on(VoiceConnectionStatus.Ready, async () => {
      await interaction.reply(`Joined: ${currVoiceChannel.name}.`)
    })

    connection.on(VoiceConnectionStatus.Disconnected, async (_oldState, _newState) => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ])
        // Seems to be reconnecting to a new channel - ignore disconnect
      }
      catch (error) {
        log.withError(error).log('Failed to reconnect to channel')
        // Seems to be a real disconnect which SHOULDN'T be recovered from
        connection.destroy()
      }
    })

    connection.on(VoiceConnectionStatus.Destroyed, async () => {
      log.log('Destroyed connection')
    })

    connection.receiver.speaking.on('start', async (userId) => {
      log.log(`User ${userId} started speaking`)

      try {
        const listenStream = connection.receiver.subscribe(userId, {
          end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 2000, // Max 2s of silence before ending the stream.
          },
        })

        const result = await transcribeAudioStream(log, listenStream, userId)
        const openai = createOpenAI({
          apiKey: env.OPENAI_API_KEY,
          baseURL: env.OPENAI_API_BASE_URL,
        })

        const messages = message.messages(
          systemPrompt(),
          message.user(`This is the audio transcribed text content that user want to say: ${result}`),
          message.user(`Would you like to say something? Or ignore? Your response should be in English.`),
        )

        const res = await generateText({
          ...openai.chat(env.OPENAI_MODEL ?? 'gpt-4o-mini'),
          messages,
        })

        log.withField('text', res.text).log(`Generated response`)

        if (!res.text) {
          log.log('No response generated')
          return
        }

        const elevenlabs = createUnElevenLabs({
          apiKey: env.ELEVENLABS_API_KEY,
          baseURL: env.ELEVENLABS_API_BASE_URL,
        })

        const speechRes = await generateSpeech({
          ...elevenlabs.speech({ model: 'elevenlabs/eleven_multilingual_v2', voice: 'lNxY9WuCBCZCISASyJ55' }),
          input: res.text,
        })

        log.withField('length', speechRes.byteLength).withField('text', Buffer.from(speechRes).toString('utf-8')).log('Generated speech')

        const audioResource = createAudioResource(Readable.from(Buffer.from(speechRes)))
        player.play(audioResource)
      }
      catch (err) {
        log.withError(err).log('Error handling user speaking')
      }
    })

    connection.receiver.speaking.on('end', (userId) => {
      log.log(`User ${userId} stopped speaking`)
    })
  }
  catch (error) {
    log.error(error)
    await interaction.reply('Could not join voice channel.')
  }
}

async function transcribeAudioStream(log: ReturnType<typeof useLogg>, stream: AudioReceiveStream, userId: string) {
  async function createDirIfNotExists(path: string) {
    if (!(await exists(path))) {
      await mkdir(path, { recursive: true })
    }
  }

  return new Promise<string>((resolve, reject) => {
    createDirIfNotExists(`temp/audios/${userId}`).then(() => {
      try {
        const fileBasename = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss')

        // Generate a uid for the audio file.
        // Create a stream that writes a new pcm file with the generated uid
        const writeStream = createWriteStream(`temp/audios/${userId}/${fileBasename}.pcm`, { flags: 'a' })

        stream.on('error', (err) => {
          reject(err)
        })

        // Create the pipeline
        stream.on('data', async (chunk) => {
          try {
            const pcm = decoder.decode(chunk)
            writeStream.write(pcm)
          }
          catch (err) {
            log.withError(err).log('Error decoding audio')
          }
        })

        // When user stops talking, stop the stream and generate an mp3 file.
        stream.on('end', async () => {
          writeStream.end()

          ffmpeg()
            .input(`temp/audios/${userId}/${fileBasename}.pcm`)
            .inputFormat('s32le')
            .audioFrequency(60000)
            .audioChannels(2)
            .output(`temp/audios/${userId}/${fileBasename}.wav`)
            .outputFormat('wav')
            .on('error', (err) => {
              reject(err)
            })
            .on('end', async () => {
              log.log('Audio file generated')

              // Read .wav file and convert it to required format
              const wav = new wavefile.WaveFile(await readFile(`temp/audios/${userId}/${fileBasename}.wav`))
              wav.toBitDepth('32f') // Pipeline expects input as a Float32Array
              wav.toSampleRate(16000) // Whisper expects audio with a sampling rate of 16000
              const audioData = wav.getSamples()

              const transcriber = await WhisperLargeV3Pipeline.getInstance()
              log.log('Transcribing audio')

              const result = await transcriber(audioData)
              if (Array.isArray(result)) {
                const arrayResult = result as { text: string }[]
                if (arrayResult.length === 0) {
                  log.log('No transcription result')
                  return resolve('')
                }

                log.withField('result', result[0].text).log('Transcription result')
                resolve(result[0].text)
              }
              else {
                if ('text' in result) {
                  log.withField('result', result.text).log('Transcription result')
                  return resolve(result.text)
                }
                else {
                  log.withField('result', result).log('No transcription result')
                  return resolve('')
                }
              }
            })
            .run()
        })
      }
      catch (err) {
        reject(err)
      }
    })
  })
}
