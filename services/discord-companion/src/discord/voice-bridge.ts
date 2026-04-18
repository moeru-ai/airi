import type { Buffer } from 'node:buffer'

import type { VoiceConnection } from '@discordjs/voice'
import type {
  Client as DiscordClient,
  GuildMember,
  VoiceBasedChannel,
} from 'discord.js'

import type { AiriChannel } from '../airi/channel'
import type { OpenAITranscribeOptions } from '../stt/openai'

import { pipeline } from 'node:stream'

import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice'
import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { DECODE_CHANNELS, DECODE_SAMPLE_RATE } from '../audio/constants'
import { OpusDecoder } from '../audio/opus-decoder'
import { createVoiceSegmenter } from '../audio/voice-segmenter'
import { pcmToWav } from '../audio/wav'
import { isUsefulTranscription, openaiTranscribe } from '../stt/openai'

const log = useLogg('Discord:VoiceBridge').useGlobalConfig()

export interface VoiceBridgeOptions {
  client: DiscordClient
  airi: AiriChannel
  stt: OpenAITranscribeOptions
}

interface ActiveConnection {
  guildId: string
  voiceChannelId: string
  connection: VoiceConnection
  /**
   * Associated text channel (for voice-attached chat). Discord populates
   * `VoiceBasedChannel.id` equal to the text channel id for standard voice
   * channels, but we capture it explicitly for clarity and future-proofing.
   */
  attachedTextChannelId: string
  /**
   * Stop functions for per-user subscriptions so we can tear down cleanly when
   * the bot leaves the channel.
   */
  stopFns: Map<string, () => void>
}

export interface VoiceBridgeHandle {
  /**
   * Joins a voice channel; destroys any existing connection for the same guild.
   */
  join: (channel: VoiceBasedChannel) => Promise<void>
  /**
   * Leaves a guild's voice channel if currently connected.
   */
  leave: (guildId: string) => void
  /**
   * Returns the text channel id that is attached to the voice channel the bot
   * is currently connected to in `guildId`, if any.
   */
  getAttachedTextChannelId: (guildId: string) => string | undefined
  /**
   * Tears down all voice connections and subscriptions.
   */
  destroy: () => void
}

/**
 * Creates a Discord voice bridge that joins voice channels, streams per-user
 * Opus audio through a decoder + segmenter, and forwards STT transcriptions to
 * AIRI.
 *
 * Call stack:
 *
 * CompanionService (../index)
 * -> {@link createVoiceBridge}
 * -> joinVoiceChannel (@discordjs/voice)
 * -> {@link OpusDecoder}
 * -> {@link createVoiceSegmenter}
 * -> {@link openaiTranscribe}
 * -> AiriChannel.sendChatInput
 */
export function createVoiceBridge(options: VoiceBridgeOptions): VoiceBridgeHandle {
  const connections = new Map<string, ActiveConnection>()

  const subscribeToMember = (
    active: ActiveConnection,
    member: GuildMember,
    channel: VoiceBasedChannel,
  ) => {
    const userId = member.id
    if (active.stopFns.has(userId))
      return

    const receive = active.connection.receiver.subscribe(userId, {
      autoDestroy: true,
      emitClose: true,
    })

    const decoder = new OpusDecoder(DECODE_SAMPLE_RATE, DECODE_CHANNELS)
    pipeline(receive, decoder, (err) => {
      if (err) {
        log
          .withError(err)
          .withField('userId', userId)
          .error('Opus decoding pipeline error')
      }
    })

    const segmenter = createVoiceSegmenter(decoder, {
      onStart: () => {
        log.withField('displayName', member.displayName).log('User started speaking')
      },
      onSegment: async (pcm: Buffer) => {
        if (pcm.length === 0)
          return

        try {
          const wav = pcmToWav(pcm)
          const transcription = await openaiTranscribe(wav, options.stt)
          if (!isUsefulTranscription(transcription))
            return

          log
            .withField('displayName', member.displayName)
            .withField('transcription', transcription)
            .log('Voice transcription ready')

          options.airi.sendChatInput({
            kind: 'voice',
            text: transcription,
            discord: {
              channelId: active.attachedTextChannelId,
              guildId: channel.guildId ?? undefined,
              guildName: channel.guild?.name ?? undefined,
              guildMember: {
                id: member.id,
                displayName: member.displayName ?? member.user.username,
                nickname: member.nickname ?? member.user.username,
              },
            },
          })
        }
        catch (error) {
          log
            .withError(error)
            .withField('message', errorMessageFrom(error) ?? 'unknown error')
            .error('Failed to process voice segment')
        }
      },
    })

    const onReceiveClose = () => {
      segmenter.stop()
      decoder.end()
      active.stopFns.delete(userId)
    }

    receive.once('close', onReceiveClose)

    active.stopFns.set(userId, () => {
      receive.off('close', onReceiveClose)
      segmenter.stop()
      try {
        decoder.end()
      }
      catch {
        // decoder already ended
      }
    })
  }

  const wireConnection = (
    connection: VoiceConnection,
    channel: VoiceBasedChannel,
    active: ActiveConnection,
  ) => {
    connection.on('stateChange', async (oldState, newState) => {
      log
        .withField('old', oldState.status)
        .withField('new', newState.status)
        .log('Voice connection state changed')

      if (newState.status === VoiceConnectionStatus.Destroyed) {
        for (const stop of active.stopFns.values()) {
          stop()
        }
        active.stopFns.clear()
        connections.delete(active.guildId)
        return
      }

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ])
          log.log('Reconnecting voice connection...')
        }
        catch (error) {
          log.withError(error).log('Voice connection lost, destroying')
          connection.destroy()
        }
      }
    })

    connection.on('error', error => log.withError(error).error('Voice connection error'))

    connection.receiver.speaking.on('start', async (userId) => {
      let member = channel.members.get(userId)
      if (!member) {
        try {
          member = await channel.guild.members.fetch(userId)
        }
        catch (error) {
          log.withError(error).error('Failed to fetch guild member')
          return
        }
      }
      if (!member || member.user.bot)
        return

      subscribeToMember(active, member, channel)
    })
  }

  const join = async (channel: VoiceBasedChannel) => {
    const existing = connections.get(channel.guildId)
    if (existing) {
      log.log(`Leaving previous voice channel in guild ${channel.guildId}`)
      for (const stop of existing.stopFns.values()) {
        stop()
      }
      existing.stopFns.clear()
      existing.connection.destroy()
      connections.delete(channel.guildId)
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
      group: options.client.user?.id ?? 'discord-companion',
    })

    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Ready, 20_000),
      entersState(connection, VoiceConnectionStatus.Signalling, 20_000),
    ])

    const active: ActiveConnection = {
      guildId: channel.guildId,
      voiceChannelId: channel.id,
      attachedTextChannelId: channel.id,
      connection,
      stopFns: new Map(),
    }

    connections.set(channel.guildId, active)
    wireConnection(connection, channel, active)

    log.withField('channel', channel.name).log('Joined voice channel')
  }

  const leave = (guildId: string) => {
    const active = connections.get(guildId)
    if (!active) {
      const existing = getVoiceConnection(guildId, options.client.user?.id)
      existing?.destroy()
      return
    }

    for (const stop of active.stopFns.values()) {
      stop()
    }
    active.stopFns.clear()
    active.connection.destroy()
    connections.delete(guildId)
  }

  const getAttachedTextChannelId = (guildId: string) =>
    connections.get(guildId)?.attachedTextChannelId

  const destroy = () => {
    for (const active of connections.values()) {
      for (const stop of active.stopFns.values()) {
        stop()
      }
      active.stopFns.clear()
      try {
        active.connection.destroy()
      }
      catch {
        // already destroyed
      }
    }
    connections.clear()
  }

  return { join, leave, getAttachedTextChannelId, destroy }
}
