import type { AudioReceiveStream } from '@discordjs/voice'
import type { useLogg } from '@guiiai/logg'
import type { Client } from '@proj-airi/server-sdk'
import type { CacheType, ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'
import { createAudioPlayer, EndBehaviorType, entersState, joinVoiceChannel, NoSubscriberBehavior, VoiceConnectionStatus } from '@discordjs/voice'
import OpusScript from 'opusscript'

import { transcribe } from '../../../pipelines/tts'

const decoder = new OpusScript(48000, 2)

async function transcribeTextFromAudioReceiveStream(stream: AudioReceiveStream) {
  return new Promise<string>((resolve, reject) => {
    try {
      let pcmBuffer = Buffer.alloc(0)
      const pcmStream = new Writable({
        write(chunk, _encoding, callback) {
          pcmBuffer = Buffer.concat([pcmBuffer, chunk])
          callback()
        },
      })

      stream.on('error', (err) => {
        reject(err)
      })

      // Create the pipeline
      stream.on('data', async (chunk) => {
        try {
          const pcm = decoder.decode(chunk)
          pcmStream.write(pcm)
        }
        catch (err) {
          reject(err)
        }
      })

      // When user stops talking, stop the stream and generate an mp3 file.
      stream.on('end', async () => {
        try {
          pcmStream.end()

          const result = await transcribe(pcmBuffer)
          resolve(result)
        }
        catch (err) {
          reject(err)
        }
      })
    }
    catch (err) {
      reject(err)
    }
  })
}

export async function handleSummon(log: ReturnType<typeof useLogg>, interaction: ChatInputCommandInteraction<CacheType>, airiClient: Client) {
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

        const speakingUser = await interaction.guild.members.fetch(userId)
        const result = await transcribeTextFromAudioReceiveStream(listenStream)

        airiClient.send({ type: 'input:voice:discord:transcription', data: {
          text: result,
          userDisplayName: speakingUser.displayName,
          userId,
          username: speakingUser.nickname,
        } })
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
