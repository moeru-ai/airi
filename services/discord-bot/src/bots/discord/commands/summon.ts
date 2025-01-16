import type { AudioPlayer, VoiceConnection } from '@discordjs/voice'
import type { Client as AiriClient } from '@proj-airi/server-sdk'
import type { Discord } from '@proj-airi/server-shared/types'
import type { BaseGuildVoiceChannel, CacheType, ChatInputCommandInteraction, Client as DiscordClient, GuildMember } from 'discord.js'
import type { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { pipeline, Transform } from 'node:stream'
import { createAudioPlayer, createAudioResource, entersState, getVoiceConnections, joinVoiceChannel, NoSubscriberBehavior, StreamType, VoiceConnectionStatus } from '@discordjs/voice'
import { useLogg } from '@guiiai/logg'

import OpusScript from 'opusscript'
import { openaiTranscribe } from '../../../pipelines/tts'
import { getWavHeader } from '../../../utils/audio'

class OpusDecoderStream extends Transform {
  private decoder: OpusScript

  /**
   * @param sampleRate - The audio sample rate (e.g., 16000 Hz)
   * @param channels - Number of audio channels (e.g., 1 for mono)
   */
  constructor(sampleRate: 8000 | 12000 | 16000 | 24000 | 48000, channels: number) {
    super()
    this.decoder = new OpusScript(sampleRate, channels)
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: (...args: any[]) => void) {
    try {
      // Decode Opus chunk to PCM
      const pcm = this.decoder.decode(chunk)
      if (pcm) {
        this.push(Buffer.from(pcm))
      }
      callback()
    }
    catch (error) {
      this.emit('error', error)
      callback(error)
    }
  }

  _flush(callback: (...args: any[]) => void) {
    callback()
  }
}

// These values are chosen for compatibility with picovoice components
// const DECODE_FRAME_SIZE = 1024
const DECODE_SAMPLE_RATE = 16000

// eliza/packages/client-discord/src/voice.ts at develop · elizaOS/eliza
// https://github.com/elizaOS/eliza/blob/develop/packages/client-discord/src/voice.ts
export class AudioMonitor {
  private readable: Readable
  private buffers: Buffer[] = []
  private maxSize: number
  private lastFlagged: number = -1
  private ended: boolean = false
  private logger = useLogg('AudioMonitor').useGlobalConfig()

  constructor(
    readable: Readable,
    maxSize: number,
    onStart: () => void,
    callback: (buffer: Buffer) => void,
  ) {
    this.readable = readable
    this.maxSize = maxSize
    this.readable.on('data', (chunk: Buffer) => {
      // this.logger.log('AudioMonitor got data');
      if (this.lastFlagged < 0) {
        this.lastFlagged = this.buffers.length
      }
      this.buffers.push(chunk)
      const currentSize = this.buffers.reduce(
        (acc, cur) => acc + cur.length,
        0,
      )
      while (currentSize > this.maxSize) {
        this.buffers.shift()
        this.lastFlagged--
      }
    })
    this.readable.on('end', () => {
      this.logger.log('AudioMonitor ended')
      this.ended = true
      if (this.lastFlagged < 0)
        return
      callback(this.getBufferFromStart())
      this.lastFlagged = -1
    })
    this.readable.on('speakingStopped', () => {
      if (this.ended)
        return
      this.logger.log('Speaking stopped')
      if (this.lastFlagged < 0)
        return
      callback(this.getBufferFromStart())
    })
    this.readable.on('speakingStarted', () => {
      if (this.ended)
        return
      onStart()
      this.logger.log('Speaking started')
      this.reset()
    })
  }

  stop() {
    this.readable.removeAllListeners('data')
    this.readable.removeAllListeners('end')
    this.readable.removeAllListeners('speakingStopped')
    this.readable.removeAllListeners('speakingStarted')
  }

  isFlagged() {
    return this.lastFlagged >= 0
  }

  getBufferFromFlag() {
    if (this.lastFlagged < 0) {
      return null
    }
    const buffer = Buffer.concat(this.buffers.slice(this.lastFlagged))
    return buffer
  }

  getBufferFromStart() {
    const buffer = Buffer.concat(this.buffers)
    return buffer
  }

  reset() {
    this.buffers = []
    this.lastFlagged = -1
  }

  isEnded() {
    return this.ended
  }
}

function isValidTranscription(text: string): boolean {
  if (!text || text.includes('[BLANK_AUDIO]'))
    return false
  return true
}

// eliza/packages/client-discord/src/voice.ts at develop · elizaOS/eliza
// https://github.com/elizaOS/eliza/blob/develop/packages/client-discord/src/voice.ts

export class VoiceManager extends EventEmitter {
  private logger = useLogg('VoiceManager').useGlobalConfig()
  private processingVoice: boolean = false
  private transcriptionTimeout: NodeJS.Timeout | null = null
  private userStates: Map<
    string,
    {
      buffers: Buffer[]
      totalLength: number
      lastActive: number
      transcriptionText: string
    }
  > = new Map()

  private activeAudioPlayer: AudioPlayer | null = null
  private client: DiscordClient
  private airiClient: AiriClient
  private streams: Map<string, Readable> = new Map()
  private connections: Map<string, VoiceConnection> = new Map()
  private activeMonitors: Map<
    string,
    { channel: BaseGuildVoiceChannel, monitor: AudioMonitor }
  > = new Map()

  constructor(client: DiscordClient, airiClient: AiriClient) {
    super()
    this.client = client
    this.airiClient = airiClient
  }

  async joinChannel(interaction: ChatInputCommandInteraction<CacheType>, channel: BaseGuildVoiceChannel) {
    const oldConnection = this.getVoiceConnection(
      channel.guildId as string,
    )
    if (oldConnection) {
      try {
        oldConnection.destroy()
        // Remove all associated streams and monitors
        this.streams.clear()
        this.activeMonitors.clear()
      }
      catch (error) {
        console.error('Error leaving voice channel:', error)
      }
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
      group: this.client.user.id,
    })

    try {
      // Wait for either Ready or Signalling state
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Ready, 20_000),
        entersState(connection, VoiceConnectionStatus.Signalling, 20_000),
      ])

      // Log connection success
      this.logger.log(
        `Voice connection established in state: ${connection.state.status}`,
      )

      await interaction.reply(`Joined: ${channel.name}.`)

      // Set up ongoing state change monitoring
      connection.on('stateChange', async (oldState, newState) => {
        this.logger.log(
          `Voice connection state changed from ${oldState.status} to ${newState.status}`,
        )

        if (newState.status === VoiceConnectionStatus.Disconnected) {
          this.logger.log('Handling disconnection...')

          try {
            // Try to reconnect if disconnected
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ])
            // Seems to be reconnecting to a new channel
            this.logger.log('Reconnecting to channel...')
          }
          catch (e) {
            // Seems to be a real disconnect, destroy and cleanup
            this.logger.log(`Disconnection confirmed - cleaning up...${e}`)
            connection.destroy()
            this.connections.delete(channel.id)
          }
        }
        else if (
          newState.status === VoiceConnectionStatus.Destroyed
        ) {
          this.connections.delete(channel.id)
        }
        else if (
          !this.connections.has(channel.id)
          && (newState.status === VoiceConnectionStatus.Ready
            || newState.status === VoiceConnectionStatus.Signalling)
        ) {
          this.connections.set(channel.id, connection)
        }
      })

      connection.on('error', (error) => {
        this.logger.log('Voice connection error:', error)
        // Don't immediately destroy - let the state change handler deal with it
        this.logger.log('Connection error - will attempt to recover...')
      })

      // Store the connection
      this.connections.set(channel.id, connection)

      // Continue with voice state modifications
      const me = channel.guild.members.me
      if (me?.voice && me.permissions.has('DeafenMembers')) {
        try {
          await me.voice.setDeaf(false)
          await me.voice.setMute(false)
        }
        catch (error) {
          this.logger.log('Failed to modify voice state:', error)
          // Continue even if this fails
        }
      }

      connection.receiver.speaking.on('start', async (userId: string) => {
        let user = channel.members.get(userId)
        if (!user) {
          try {
            user = await channel.guild.members.fetch(userId)
          }
          catch (error) {
            console.error('Failed to fetch user:', error)
          }
        }
        if (user && !user?.user.bot) {
          this.logger.log(`User speaking: ${user.displayName}`)
          this.monitorMember(user as GuildMember, channel.id)
          this.streams.get(userId)?.emit('speakingStarted')
        }
      })

      connection.receiver.speaking.on('end', async (userId: string) => {
        const user = channel.members.get(userId)
        if (!user?.user.bot) {
          this.logger.log(`User stopped speaking: ${user.displayName}`)
          this.streams.get(userId)?.emit('speakingStopped')
        }
      })
    }
    catch (error) {
      this.logger.log('Failed to establish voice connection:', error)
      connection.destroy()
      this.connections.delete(channel.id)
      throw error
    }
  }

  private getVoiceConnection(guildId: string) {
    const connections = getVoiceConnections(this.client.user.id)
    if (!connections) {
      this.logger.warn('No voice connections found')
      return
    }
    const connection = [...connections.values()].find(
      connection => connection.joinConfig.guildId === guildId,
    )
    if (!connection) {
      this.logger.warn('No voice connection found for guild')
    }

    return connection
  }

  private async monitorMember(
    member: GuildMember,
    channelId: string,
  ) {
    const userId = member?.id
    const connection = this.getVoiceConnection(member?.guild?.id)
    const receiveStream = connection?.receiver.subscribe(userId, {
      autoDestroy: true,
      emitClose: true,
    })
    if (!receiveStream) {
      this.logger.warn('No voice data received')
      return
    }

    const opusDecoder = new OpusDecoderStream(DECODE_SAMPLE_RATE, 1)
    const volumeBuffer: number[] = []
    const VOLUME_WINDOW_SIZE = 30
    const SPEAKING_THRESHOLD = 0.05
    opusDecoder.on('data', (pcmData: Buffer) => {
      // Monitor the audio volume while the agent is speaking.
      // If the average volume of the user's audio exceeds the defined threshold, it indicates active speaking.
      // When active speaking is detected, stop the agent's current audio playback to avoid overlap.

      if (this.activeAudioPlayer) {
        const samples = new Int16Array(
          pcmData.buffer,
          pcmData.byteOffset,
          pcmData.length / 2,
        )
        const maxAmplitude = Math.max(...samples.map(Math.abs)) / 32768
        volumeBuffer.push(maxAmplitude)

        if (volumeBuffer.length > VOLUME_WINDOW_SIZE) {
          volumeBuffer.shift()
        }
        const avgVolume
                    = volumeBuffer.reduce((sum, v) => sum + v, 0)
                      / VOLUME_WINDOW_SIZE

        if (avgVolume > SPEAKING_THRESHOLD) {
          volumeBuffer.length = 0
          this.cleanupAudioPlayer(this.activeAudioPlayer)
          this.processingVoice = false
        }
      }
    })

    pipeline(receiveStream, opusDecoder, (err) => {
      this.logger.withError(err).error('Opus decoding pipeline error')
    })

    this.streams.set(userId, opusDecoder)
    this.connections.set(userId, connection as VoiceConnection)
    opusDecoder.on('error', (err: any) => {
      this.logger.log(`Opus decoding error: ${err}`)
    })
    const errorHandler = (err: any) => {
      this.logger.log(`Opus decoding error: ${err}`)
    }
    const streamCloseHandler = () => {
      this.logger.log(`voice stream from ${member?.displayName} closed`)
      this.streams.delete(userId)
      this.connections.delete(userId)
    }
    const closeHandler = () => {
      this.logger.log(`Opus decoder for ${member?.displayName} closed`)
      opusDecoder.removeListener('error', errorHandler)
      opusDecoder.removeListener('close', closeHandler)
      receiveStream?.removeListener('close', streamCloseHandler)
    }
    opusDecoder.on('error', errorHandler)
    opusDecoder.on('close', closeHandler)
    receiveStream?.on('close', streamCloseHandler)

    this.logger.log(`Monitoring user: ${member.displayName}`)
    await this.handleUserStream(userId, member.displayName, member.nickname, member.guild.id, channelId, opusDecoder)
  }

  leaveChannel(channel: BaseGuildVoiceChannel) {
    const connection = this.connections.get(channel.id)
    if (connection) {
      connection.destroy()
      this.connections.delete(channel.id)
    }

    // Stop monitoring all members in this channel
    for (const [memberId, monitorInfo] of this.activeMonitors) {
      if (
        monitorInfo.channel.id === channel.id
        && memberId !== this.client.user?.id
      ) {
        this.stopMonitoringMember(memberId)
      }
    }

    this.logger.log(`Left voice channel: ${channel.name} (${channel.id})`)
  }

  stopMonitoringMember(memberId: string) {
    const monitorInfo = this.activeMonitors.get(memberId)
    if (monitorInfo) {
      monitorInfo.monitor.stop()
      this.activeMonitors.delete(memberId)
      this.streams.delete(memberId)
      this.logger.log(`Stopped monitoring user ${memberId}`)
    }
  }

  async debouncedProcessTranscription(
    userId: string,
    displayName: string,
    nickname: string,
    guildId: string,
    channelId: string,
  ) {
    const DEBOUNCE_TRANSCRIPTION_THRESHOLD = 1500 // wait for 1.5 seconds of silence

    if (this.activeAudioPlayer?.state?.status === 'idle') {
      this.logger.log('Cleaning up idle audio player.')
      this.cleanupAudioPlayer(this.activeAudioPlayer)
    }

    if (this.activeAudioPlayer || this.processingVoice) {
      const state = this.userStates.get(userId)
      state.buffers.length = 0
      state.totalLength = 0
      return
    }

    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout)
    }

    this.transcriptionTimeout = setTimeout(async () => {
      this.processingVoice = true
      try {
        await this.processTranscription(
          userId,
          displayName,
          nickname,
          guildId,
          channelId,
        )

        // Clean all users' previous buffers
        this.userStates.forEach((state, _) => {
          state.buffers.length = 0
          state.totalLength = 0
        })
      }
      finally {
        this.processingVoice = false
      }
    }, DEBOUNCE_TRANSCRIPTION_THRESHOLD)
  }

  private async handleUserStream(
    userId: string,
    displayName: string,
    nickname: string,
    guildId: string,
    channelId: string,
    audioStream: Readable,
  ) {
    this.logger.log(`Starting audio monitor for user: ${userId}`)
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        buffers: [],
        totalLength: 0,
        lastActive: Date.now(),
        transcriptionText: '',
      })
    }

    const state = this.userStates.get(userId)

    const processBuffer = async (buffer: Buffer) => {
      try {
        state!.buffers.push(buffer)
        state!.totalLength += buffer.length
        state!.lastActive = Date.now()
        this.debouncedProcessTranscription(
          userId,
          displayName,
          nickname,
          guildId,
          channelId,
        )
      }
      catch (error) {
        console.error(
          `Error processing buffer for user ${userId}:`,
          error,
        )
      }
    }

    const _ = new AudioMonitor(
      audioStream,
      10000000,
      () => {
        if (this.transcriptionTimeout) {
          clearTimeout(this.transcriptionTimeout)
        }
      },
      async (buffer) => {
        if (!buffer) {
          console.error('Received empty buffer')
          return
        }
        await processBuffer(buffer)
      },
    )
  }

  private async processTranscription(
    userId: string,
    displayName: string,
    nickname: string,
    guildId: string,
    channelId: string,
  ) {
    const state = this.userStates.get(userId)
    if (!state || state.buffers.length === 0)
      return
    try {
      const inputBuffer = Buffer.concat(state.buffers, state.totalLength)

      state.buffers.length = 0 // Clear the buffers
      state.totalLength = 0
      // Convert Opus to WAV
      const wavBuffer = await this.convertOpusToWav(inputBuffer)

      const result = await openaiTranscribe(wavBuffer)
      const transcriptionText = result

      const discordContext = {
        channelId,
        guildId,
        guildMember: {
          id: userId,
          nickname,
          displayName,
        },
      } satisfies Discord

      this.airiClient.send({
        type: 'input:text:voice',
        data: {
          transcription: transcriptionText,
          discord: discordContext,
        },
      })

      this.airiClient.send({
        type: 'input:text',
        data: {
          text: transcriptionText,
          discord: discordContext,
        },
      })

      if (transcriptionText && isValidTranscription(transcriptionText)) {
        state.transcriptionText += transcriptionText
      }

      if (state.transcriptionText.length) {
        this.cleanupAudioPlayer(this.activeAudioPlayer)
        const finalText = state.transcriptionText
        state.transcriptionText = ''
        this.logger.withField('transcription', finalText).log('Transcription complete')
      }
    }
    catch (error) {
      console.error(
        `Error transcribing audio for user ${userId}:`,
        error,
      )
    }
  }

  private async convertOpusToWav(pcmBuffer: Buffer): Promise<Buffer> {
    try {
      // Generate the WAV header
      const wavHeader = getWavHeader(
        pcmBuffer.length,
        DECODE_SAMPLE_RATE,
      )

      // Concatenate the WAV header and PCM data
      const wavBuffer = Buffer.concat([wavHeader, pcmBuffer])

      return wavBuffer
    }
    catch (error) {
      console.error('Error converting PCM to WAV:', error)
      throw error
    }
  }

  async playAudioStream(userId: string, audioStream: Readable) {
    const connection = this.connections.get(userId)
    if (connection == null) {
      this.logger.log(`No connection for user ${userId}`)
      return
    }
    this.cleanupAudioPlayer(this.activeAudioPlayer)
    const audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    })
    this.activeAudioPlayer = audioPlayer
    connection.subscribe(audioPlayer)

    const audioStartTime = Date.now()

    const resource = createAudioResource(audioStream, {
      inputType: StreamType.Arbitrary,
    })
    audioPlayer.play(resource)

    audioPlayer.on('error', (err: any) => {
      this.logger.log(`Audio player error: ${err}`)
    })

    audioPlayer.on(
      'stateChange',
      (_oldState: any, newState: { status: string }) => {
        if (newState.status === 'idle') {
          const idleTime = Date.now()
          this.logger.log(
            `Audio playback took: ${idleTime - audioStartTime}ms`,
          )
        }
      },
    )
  }

  cleanupAudioPlayer(audioPlayer: AudioPlayer) {
    if (!audioPlayer)
      return

    audioPlayer.stop()
    audioPlayer.removeAllListeners()
    if (audioPlayer === this.activeAudioPlayer) {
      this.activeAudioPlayer = null
    }
  }

  async handleJoinChannelCommand(interaction: ChatInputCommandInteraction<CacheType>) {
    try {
      const currVoiceChannel = (interaction.member as GuildMember).voice.channel
      if (!currVoiceChannel) {
        return await interaction.reply('Please join a voice channel first.')
      }

      await this.joinChannel(interaction, currVoiceChannel)
    }
    catch (error) {
      this.logger.withError(error).log('Error joining voice channel')
    }
  }

  async handleLeaveChannelCommand(interaction: any) {
    const connection = this.getVoiceConnection(interaction.guildId as any)

    if (!connection) {
      await interaction.reply('Not currently in a voice channel.')
      return
    }

    try {
      connection.destroy()
      await interaction.reply('Left the voice channel.')
    }
    catch (error) {
      this.logger.withError(error).log('Error leaving voice channel')
      await interaction.reply('Failed to leave the voice channel.')
    }
  }
}
