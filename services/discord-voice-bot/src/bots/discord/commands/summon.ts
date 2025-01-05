import type { useLogg } from '@guiiai/logg'
import type { CacheType, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { createWriteStream } from 'node:fs'
import { EndBehaviorType, entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice'
import ffmpeg from 'fluent-ffmpeg'
import OpusScript from 'opusscript'

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

      const listenStream = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 2000, // Max 2s of silence before ending the stream.
        },
      })

      // Generate a uid for the audio file.
      // Create a stream that writes a new pcm file with the generated uid
      const writeStream = createWriteStream(`audio.pcm`, { flags: 'a' })
      const decoder = new OpusScript(48000, 2)

      // Create the pipeline
      listenStream.on('data', (chunk) => {
        const pcm = decoder.decode(chunk)
        writeStream.write(pcm)
      })

      // When user stops talking, stop the stream and generate an mp3 file.
      listenStream.on('end', async () => {
        writeStream.end()

        ffmpeg()
          .input(`audio.pcm`)
          .inputFormat('s32le')
          .audioFrequency(60000)
          .audioChannels(2)
          .output(`audio.wav`)
          .outputFormat('wav')
          .on('error', (err) => {
            log.error('Error:', err)
          })
          .run()
      })
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
