import type { VoiceConnection } from '@discordjs/voice'
import type { useLogg } from '@guiiai/logg'
import type { CacheType, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { EndBehaviorType, entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice'
import { formatDate } from 'date-fns'
import ffmpeg from 'fluent-ffmpeg'
import OpusScript from 'opusscript'
import wavefile from 'wavefile'

import { WhisperLargeV3Pipeline } from '../../../pipelines/tts'
import { exists } from '../../../utils/fs'

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
        await handleReceivedUserSpeaking(log, connection, userId)
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

async function handleReceivedUserSpeaking(log: ReturnType<typeof useLogg>, connection: VoiceConnection, userId: string) {
  const listenStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 2000, // Max 2s of silence before ending the stream.
    },
  })

  if (!(await exists(`temp/audios/${userId}`))) {
    await mkdir(`temp/audios/${userId}`, { recursive: true })
  }

  const fileBasename = formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss')

  // Generate a uid for the audio file.
  // Create a stream that writes a new pcm file with the generated uid
  const writeStream = createWriteStream(`temp/audios/${userId}/${fileBasename}.pcm`, { flags: 'a' })
  const decoder = new OpusScript(48000, 2)

  // Create the pipeline
  listenStream.on('data', async (chunk) => {
    try {
      const pcm = decoder.decode(chunk)
      writeStream.write(pcm)
    }
    catch (err) {
      log.withError(err).log('Error decoding audio')
    }
  })

  // When user stops talking, stop the stream and generate an mp3 file.
  listenStream.on('end', async () => {
    writeStream.end()

    ffmpeg()
      .input(`temp/audios/${userId}/${fileBasename}.pcm`)
      .inputFormat('s32le')
      .audioFrequency(60000)
      .audioChannels(2)
      .output(`temp/audios/${userId}/${fileBasename}.wav`)
      .outputFormat('wav')
      .on('error', (err) => {
        log.error('Error:', err)
      })
      .on('end', async () => {
        // Read .wav file and convert it to required format
        const wav = new wavefile.WaveFile(await readFile(`temp/audios/${userId}/${fileBasename}.wav`))
        wav.toBitDepth('32f') // Pipeline expects input as a Float32Array
        wav.toSampleRate(16000) // Whisper expects audio with a sampling rate of 16000
        const audioData = wav.getSamples()

        const transcriber = await WhisperLargeV3Pipeline.getInstance()
        const result = await transcriber(audioData)
        log.withFields({ result }).log('Transcription result')
      })
      .run()
  })
}
