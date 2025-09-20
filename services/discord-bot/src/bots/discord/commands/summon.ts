import type { Readable } from 'node:stream'

import type { AudioPlayer, VoiceConnection, VoiceConnectionState } from '@discordjs/voice'
import type { Logg } from '@guiiai/logg'
import type { Client as AiriClient } from '@proj-airi/server-sdk'
import type { Discord } from '@proj-airi/server-shared/types'
import type {
  BaseGuildVoiceChannel,
  CacheType,
  ChatInputCommandInteraction,
  Client as DiscordClient,
  GuildMember,
} from 'discord.js'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { pipeline } from 'node:stream'

import {
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnections,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from '@discordjs/voice'
import { useLogg } from '@guiiai/logg'

import { DECODE_SAMPLE_RATE } from '../../../constants/audio'
import { openaiTranscribe } from '../../../pipelines/tts'
import { convertOpusToWav } from '../../../utils/audio'
import { AudioMonitor } from '../../../utils/audio-monitor'
import { OpusDecoder } from '../../../utils/opus'

function isValidTranscription(text: string): boolean {
  if (!text || text.includes('[BLANK_AUDIO]'))
    return false
  return true
}

async function setSelfVoice(logger: Logg, me?: GuildMember | null) {
  if (me?.voice && me.permissions.has('DeafenMembers')) {
    try {
      await me.voice.setDeaf(false)
      await me.voice.setMute(false)
    }
    catch (error) {
      logger.withError(error).log('Failed to modify voice state') // Continue anyway
    }
  }
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

  handleVoiceConnectionStateChange(channel: BaseGuildVoiceChannel, connection: VoiceConnection): (oldState: VoiceConnectionState, newState: VoiceConnectionState) => Promise<void> {
    return async (oldState, newState) => {
      this.logger.withFields({ old: oldState.status, new: newState.status }).log(
        `Voice connection state changed from ${oldState.status} to ${newState.status}`,
      )

      if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.connections.delete(channel.id)
      }
      else if (!this.connections.has(channel.id) && (newState.status === VoiceConnectionStatus.Ready || newState.status === VoiceConnectionStatus.Signalling)) {
        this.connections.set(channel.id, connection)
      }
      else if (newState.status === VoiceConnectionStatus.Disconnected) {
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
    }
  }

  handleVoiceConnectionError(error: unknown) {
    this.logger.withError(error).log('Voice connection error')
    // Don't immediately destroy - let the state change handler deal with it
    this.logger.log('Connection error - will attempt to recover...')
  }

  handleAudioReceiveStreamStart(channel: BaseGuildVoiceChannel): (userId: string) => Promise<void> {
    return async (userId) => {
      let user = channel.members.get(userId)
      if (!user) {
        try {
          user = await channel.guild.members.fetch(userId)
        }
        catch (error) {
          this.logger.withError(error).error('Failed to fetch user')
        }
      }
      if (user && !user?.user.bot) {
        this.logger.log(`User speaking: ${user.displayName}`)
        this.monitorMember(user as GuildMember, channel.id)
        this.streams.get(userId)?.emit('speakingStarted')
      }
    }
  }

  handleAudioReceiveStreamEnd(channel: BaseGuildVoiceChannel): (userId: string) => void {
    return async (userId: string) => {
      const user = channel.members.get(userId)
      if (!user?.user.bot) {
        this.logger.log(`User stopped speaking: ${user.displayName}`)
        this.streams.get(userId)?.emit('speakingStopped')
      }
    }
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
        this.logger.withError(error).log('Error leaving voice channel')
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
      this.logger.withField('state', connection.state.status).log('Voice connection established in state')
      await interaction.reply(`Joined: ${channel.name}.`)

      // Set up ongoing state change monitoring
      connection.on('stateChange', this.handleVoiceConnectionStateChange(channel, connection))
      connection.on('error', this.handleVoiceConnectionError)

      // Store the connection
      this.connections.set(channel.id, connection)

      connection.receiver.speaking.on('start', this.handleAudioReceiveStreamStart(channel))
      connection.receiver.speaking.on('end', this.handleAudioReceiveStreamEnd(channel))

      // Continue with voice state modifications
      await setSelfVoice(this.logger, channel.guild.members.me)
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

    const opusDecoder = new OpusDecoder(DECODE_SAMPLE_RATE, 1)
    const volumeBuffer: number[] = []
    const VOLUME_WINDOW_SIZE = 30
    const SPEAKING_THRESHOLD = 0.05

    const dataHandler = (pcmData: Buffer) => {
      // Monitor the audio volume while the agent is speaking.
      // If the average volume of the user's audio exceeds the defined threshold, it indicates active speaking.
      // When active speaking is detected, stop the agent's current audio playback to avoid overlap.

      if (this.activeAudioPlayer) {
        const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.length / 2)
        const maxAmplitude = Math.max(...samples.map(Math.abs)) / 32768
        volumeBuffer.push(maxAmplitude)

        if (volumeBuffer.length > VOLUME_WINDOW_SIZE) {
          volumeBuffer.shift()
        }

        const avgVolume
        = volumeBuffer.reduce((sum, v) => sum + v, 0) / VOLUME_WINDOW_SIZE

        if (avgVolume > SPEAKING_THRESHOLD) {
          volumeBuffer.length = 0
          this.cleanupAudioPlayer(this.activeAudioPlayer)
          this.processingVoice = false
        }
      }
    }

    this.streams.set(userId, opusDecoder)
    this.connections.set(userId, connection as VoiceConnection)

    const errorHandler = err => this.logger.withError(err).error('Opus decoding error')
    const streamCloseHandler = () => {
      this.logger.withField('displayName', member?.displayName).log('Voice stream closed')

      this.streams.delete(userId)
      this.connections.delete(userId)
    }
    const closeHandler = () => {
      this.logger.withField('displayName', member?.displayName).log('Opus decoder closed')

      opusDecoder.removeListener('data', dataHandler)
      opusDecoder.removeListener('error', errorHandler)
      opusDecoder.removeListener('close', closeHandler)
      receiveStream?.removeListener('close', streamCloseHandler)
    }

    opusDecoder.on('data', dataHandler)
    opusDecoder.on('error', errorHandler)
    opusDecoder.on('close', closeHandler)
    receiveStream?.on('close', streamCloseHandler)

    pipeline(receiveStream, opusDecoder, (err) => {
      this.logger.withError(err).error('Opus decoding pipeline error')
      if (err.message.includes('memory access out of bounds')) {
        throw err
      }
    })

    this.logger.log(`Monitoring user: ${member.displayName}`)
    await this.handleUserStream(userId, member, member.guild.id, channelId, opusDecoder)
  }

  leaveChannel(channel: BaseGuildVoiceChannel) {
    const connection = this.connections.get(channel.id)
    if (connection) {
      connection.destroy()
      this.connections.delete(channel.id)
    }

    // Stop monitoring all members in this channel
    for (const [memberId, monitorInfo] of this.activeMonitors) {
      if (monitorInfo.channel.id === channel.id && memberId !== this.client.user?.id) {
        this.stopMonitoringMember(memberId)
      }
    }

    this.logger.log(`Left voice channel: ${channel.name} (${channel.id})`)
  }

  stopMonitoringMember(memberId: string) {
    const monitorInfo = this.activeMonitors.get(memberId)
    if (!monitorInfo) {
      return
    }

    monitorInfo.monitor.stop()
    this.activeMonitors.delete(memberId)
    this.streams.delete(memberId)
    this.logger.log(`Stopped monitoring user ${memberId}`)
  }

  async debouncedProcessTranscription(
    userId: string,
    member: GuildMember,
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
        await this.processTranscription(userId, member, guildId, channelId)
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
    member: GuildMember,
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

        this.debouncedProcessTranscription(userId, member, guildId, channelId)
      }
      catch (error) {
        this.logger.withError(error).withField('userId', userId).error('Error processing buffer')
      }
    }

    const _ = new AudioMonitor(
      audioStream,
      10000000,
      () => {
        if (this.transcriptionTimeout)
          clearTimeout(this.transcriptionTimeout)
      },
      async (buffer) => {
        if (!buffer) {
          this.logger.error('Received empty buffer')
          return
        }

        await processBuffer(buffer)
      },
    )
  }

  private async processTranscription(
    userId: string,
    member: GuildMember,
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
      const wavBuffer = await convertOpusToWav(inputBuffer)
      const result = await openaiTranscribe(wavBuffer)
      const transcriptionText = result

      if (transcriptionText && isValidTranscription(transcriptionText)) {
        state.transcriptionText += transcriptionText

        const discordContext = {
          channelId,
          guildId,
          guildMember: member,
        } satisfies Discord

        this.airiClient.send({
          type: 'input:text:voice',
          data: { transcription: transcriptionText, discord: discordContext },
        })

        this.airiClient.send({
          type: 'input:text',
          data: { text: transcriptionText, discord: discordContext },
        })
      }
      if (state.transcriptionText.length) {
        this.cleanupAudioPlayer(this.activeAudioPlayer)
        const finalText = state.transcriptionText
        state.transcriptionText = ''

        this.logger.withField('transcription', finalText).log('Transcription complete')
      }
    }
    catch (error) {
      this.logger.withError(error).withField('userId', userId).error('Error processing transcription')
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

    audioPlayer.on('error', error => this.logger.withError(error).log('Audio player error'))
    audioPlayer.on('stateChange', (_oldState: any, newState: { status: string }) => {
      if (newState.status === 'idle') {
        const idleTime = Date.now()
        this.logger.withField('elapsed', idleTime - audioStartTime).log(`Audio playback done`)
      }
    })

    audioPlayer.play(resource)
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
