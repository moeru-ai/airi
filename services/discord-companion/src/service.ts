import type { CompanionConfig, CompanionRemoteConfig } from './config'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import {
  Client as DiscordJsClient,
  Events,
  GatewayIntentBits,
  GuildMember,
  Partials,
} from 'discord.js'

import { createAiriChannel } from './airi/channel'
import { isCompanionRemoteConfig } from './config'
import { COMPANION_COMMANDS, registerCompanionCommands } from './discord/commands'
import { createOutputBridge } from './discord/output-bridge'
import { createTextBridge } from './discord/text-bridge'
import { createVoiceBridge } from './discord/voice-bridge'

const log = useLogg('CompanionService').useGlobalConfig()

export interface CompanionService {
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Creates the Discord companion service, wiring AIRI's server channel to the
 * Discord client's voice + text flows.
 *
 * Call stack:
 *
 * main (./index)
 * -> {@link createCompanionService}
 * -> {@link createAiriChannel}
 * -> {@link createVoiceBridge}
 * -> {@link createTextBridge}
 * -> {@link createOutputBridge}
 *
 * Use when:
 * - Bootstrapping the companion service as a long-running process.
 *
 * Expects:
 * - Valid config (token may be empty at start; it can be supplied later via
 *   `module:configure`).
 *
 * Returns:
 * - A handle exposing `start` (log in to Discord if a token is available) and
 *   `stop` (graceful shutdown).
 */
export function createCompanionService(initialConfig: CompanionConfig): CompanionService {
  let config = initialConfig
  let isReconfiguring = false

  const discord = new DiscordJsClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  })

  const airi = createAiriChannel({
    url: config.airiUrl,
    token: config.airiToken,
  })

  const voiceBridge = createVoiceBridge({
    client: discord,
    airi,
    stt: config.stt,
  })

  const output = createOutputBridge({ client: discord })

  const textBridge = createTextBridge({
    airi,
    getAttachedTextChannelId: guildId => voiceBridge.getAttachedTextChannelId(guildId),
    getExtraChannelIds: () => config.textListen.extraChannelIds,
    isMentionOnly: () => config.textListen.mentionOnly,
    getSelfUserId: () => discord.user?.id,
  })

  airi.onOutputMessage(async ({ channelId, content }) => {
    await output.send(channelId, content)
  })

  const applyRemoteConfig = async (incoming: CompanionRemoteConfig) => {
    if (Array.isArray(incoming.textChannelIds)) {
      config = {
        ...config,
        textListen: {
          ...config.textListen,
          extraChannelIds: Array.from(new Set(incoming.textChannelIds)),
        },
      }
    }
    if (typeof incoming.mentionOnly === 'boolean') {
      config = {
        ...config,
        textListen: {
          ...config.textListen,
          mentionOnly: incoming.mentionOnly,
        },
      }
    }
    if (incoming.autoJoin !== undefined) {
      config = {
        ...config,
        autoJoin: incoming.autoJoin ?? undefined,
      }
    }

    if (incoming.enabled === false) {
      if (discord.isReady()) {
        log.log('Disabling discord-companion per remote config')
        voiceBridge.destroy()
        await discord.destroy()
      }
      return
    }

    const nextToken = incoming.token ?? config.discordToken
    if (!nextToken) {
      log.warn('discord-companion enabled but no token provided')
      if (discord.isReady()) {
        voiceBridge.destroy()
        await discord.destroy()
      }
      return
    }

    const tokenChanged = nextToken !== config.discordToken
    if (tokenChanged) {
      config = { ...config, discordToken: nextToken }
    }

    if (tokenChanged || !discord.isReady()) {
      if (discord.isReady()) {
        log.log('Reconnecting Discord client with new token')
        voiceBridge.destroy()
        await discord.destroy()
      }
      log.log('Logging into Discord...')
      await discord.login(config.discordToken)
    }
  }

  airi.onConfigure(async (incoming) => {
    if (isReconfiguring) {
      log.warn('Reconfigure already in progress, skipping')
      return
    }

    if (!isCompanionRemoteConfig(incoming)) {
      log.warn('Received invalid discord-companion module:configure payload')
      return
    }

    isReconfiguring = true
    try {
      await applyRemoteConfig(incoming)
    }
    catch (error) {
      log
        .withError(error)
        .withField('message', errorMessageFrom(error) ?? 'unknown error')
        .error('Failed to apply discord-companion remote configuration')
    }
    finally {
      isReconfiguring = false
    }
  })

  discord.once(Events.ClientReady, async (ready) => {
    log.withField('user', ready.user.tag).log('Discord client ready')

    if (config.discordClientId) {
      await registerCompanionCommands(config.discordToken, config.discordClientId)
    }
    else {
      await registerCompanionCommands(config.discordToken, ready.user.id)
    }

    if (config.autoJoin) {
      try {
        const guild = await ready.guilds.fetch(config.autoJoin.guildId)
        const channel = await guild.channels.fetch(config.autoJoin.channelId)
        if (channel?.isVoiceBased()) {
          await voiceBridge.join(channel)
        }
        else {
          log.warn('Configured auto-join channel is not a voice channel')
        }
      }
      catch (error) {
        log
          .withError(error)
          .withField('message', errorMessageFrom(error) ?? 'unknown error')
          .error('Auto-join failed')
      }
    }
  })

  discord.on(Events.MessageCreate, (message) => {
    try {
      textBridge.handleMessage(message)
    }
    catch (error) {
      log
        .withError(error)
        .withField('message', errorMessageFrom(error) ?? 'unknown error')
        .error('Failed to handle Discord message')
    }
  })

  discord.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand())
      return

    log
      .withField('command', interaction.commandName)
      .withField('user', interaction.user.tag)
      .log('Slash command received')

    switch (interaction.commandName) {
      case COMPANION_COMMANDS.ping: {
        await interaction.reply('Pong! discord-companion is online.')
        return
      }
      case COMPANION_COMMANDS.join: {
        const member = interaction.member
        const voiceChannel = member instanceof GuildMember
          ? member.voice.channel
          : null
        if (!voiceChannel) {
          await interaction.reply('Please join a voice channel first.')
          return
        }
        try {
          await interaction.deferReply()
          await voiceBridge.join(voiceChannel)
          await interaction.editReply(`Joined voice channel: ${voiceChannel.name}`)
        }
        catch (error) {
          log
            .withError(error)
            .withField('message', errorMessageFrom(error) ?? 'unknown error')
            .error('Failed to join voice channel')
          await safeReply(interaction, 'Failed to join the voice channel.')
        }
        return
      }
      case COMPANION_COMMANDS.leave: {
        const guildId = interaction.guildId
        if (!guildId) {
          await interaction.reply('This command can only be used inside a guild.')
          return
        }
        voiceBridge.leave(guildId)
        await interaction.reply('Left the voice channel.')
      }
    }
  })

  const start = async () => {
    log.log('Starting discord-companion service...')
    if (!config.discordToken) {
      log.warn('No Discord token configured; waiting for module:configure from AIRI host')
      return
    }
    try {
      await discord.login(config.discordToken)
      log.log('Logged in to Discord')
    }
    catch (error) {
      log
        .withError(error)
        .withField('message', errorMessageFrom(error) ?? 'unknown error')
        .error('Failed to log in to Discord')
      throw error
    }
  }

  const stop = async () => {
    log.log('Stopping discord-companion service...')
    try {
      voiceBridge.destroy()
      await discord.destroy()
      airi.close()
    }
    catch (error) {
      log
        .withError(error)
        .withField('message', errorMessageFrom(error) ?? 'unknown error')
        .error('Error while stopping discord-companion')
    }
  }

  return { start, stop }
}

async function safeReply(
  interaction: import('discord.js').ChatInputCommandInteraction,
  content: string,
) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content)
    }
    else {
      await interaction.reply(content)
    }
  }
  catch (error) {
    log
      .withError(error)
      .withField('message', errorMessageFrom(error) ?? 'unknown error')
      .error('Failed to reply to interaction')
  }
}
