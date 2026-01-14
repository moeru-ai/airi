import type { Discord } from '@proj-airi/server-shared/types'
import type { Interaction } from 'discord.js'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { Client as AiriClient } from '@proj-airi/server-sdk'
import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'

import { handlePing, registerCommands, VoiceManager } from '../bots/discord/commands'

const log = useLogg('DiscordAdapter')

export interface DiscordAdapterConfig {
  discordToken?: string
  airiToken?: string
  airiUrl?: string
}

// Define Discord configuration type
interface DiscordConfig {
  token?: string
  enabled?: boolean
}

// Type guard to safely validate the configuration object
function isDiscordConfig(config: unknown): config is DiscordConfig {
  if (typeof config !== 'object' || config === null)
    return false
  const c = config as Record<string, unknown>
  return (typeof c.token === 'string' || typeof c.token === 'undefined')
    && (typeof c.enabled === 'boolean' || typeof c.enabled === 'undefined')
}

function normalizeDiscordMetadata(discord?: Discord): Discord | undefined {
  if (!discord)
    return undefined

  if (!discord.guildMember)
    return discord

  const { guildMember } = discord

  return {
    ...discord,
    guildMember: {
      id: guildMember.id ?? guildMember.displayName ?? guildMember.nickname ?? '',
      nickname: guildMember.nickname ?? guildMember.displayName ?? '',
      displayName: guildMember.displayName ?? guildMember.nickname ?? '',
    },
  }
}

export class DiscordAdapter {
  private airiClient: AiriClient
  private discordClient: Client
  private discordToken: string
  private voiceManager: VoiceManager
  private isReconnecting = false

  constructor(config: DiscordAdapterConfig) {
    this.discordToken = config.discordToken || env.DISCORD_TOKEN || ''

    // Initialize Discord client
    this.discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    })

    // Initialize AIRI client
    this.airiClient = new AiriClient({
      name: 'discord',
      possibleEvents: [
        'input:text',
        'input:text:voice',
        'input:voice',
        'module:configure',
        'output:gen-ai:chat:message',
      ],
      token: config.airiToken,
      url: config.airiUrl,
    })

    this.voiceManager = new VoiceManager(this.discordClient, this.airiClient)

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle configuration from UI
    this.airiClient.onEvent('module:configure', async (event) => {
      if (this.isReconnecting) {
        log.warn('A reconnect is already in progress, skipping this configuration event.')
        return
      }
      this.isReconnecting = true
      try {
        log.log('Received Discord configuration:', event.data.config)

        if (isDiscordConfig(event.data.config)) {
          const config = event.data.config as DiscordConfig
          const { token, enabled } = config

          if (enabled === false) {
            if (this.discordClient.isReady) {
              log.log('Disabling Discord bot as per configuration...')
              await this.discordClient.destroy()
            }
            return
          }

          // If enabled, but no token is provided, stop the bot if it's running.
          if (!token) {
            log.warn('Discord bot enabled, but no token provided. Stopping bot.')
            if (this.discordClient.isReady) {
              await this.discordClient.destroy()
            }
            return
          }

          // Connect or reconnect if token changed or client is not ready.
          if (this.discordToken !== token || !this.discordClient.isReady) {
            this.discordToken = token
            if (this.discordClient.isReady) {
              log.log('Reconnecting Discord client with new token...')
              await this.discordClient.destroy()
            }
            log.log('Connecting Discord client...')
            await this.discordClient.login(this.discordToken)
            log.log('Discord client connected.')
          }
        }
        else {
          log.warn('Invalid Discord configuration received, skipping...')
        }
      }
      catch (error) {
        log.withError(error as Error).error('Failed to apply Discord configuration.')
      }
      finally {
        this.isReconnecting = false
      }
    })

    // Handle input from AIRI system
    this.airiClient.onEvent('input:text', async (event) => {
      log.log('Received input from AIRI system:', event.data.text)
      // Process Discord-related commands
      // For now, we'll just log the input
    })

    // Handle output from AIRI system (IA response)
    this.airiClient.onEvent('output:gen-ai:chat:message', async (event) => {
      try {
        const message = (event.data as { message?: { content: string } }).message
        const discordContext = (event.data)['gen-ai:chat'].input.data.discord
        if (message?.content && discordContext?.channelId) {
          const channel = await this.discordClient.channels.fetch(discordContext.channelId)
          if (channel?.isTextBased() && 'send' in channel && typeof channel.send === 'function') {
            const content = message.content
            if (content.length <= 2000) {
              await channel.send(content)
            }
            else {
              let remaining = content
              while (remaining.length > 0) {
                let chunkSize = 2000
                if (remaining.length > 2000) {
                  // Try to split at the last newline before 2000
                  const lastNewline = remaining.lastIndexOf('\n', 2000)
                  if (lastNewline > -1) {
                    chunkSize = lastNewline
                  }
                  else {
                    // Fallback to last space
                    const lastSpace = remaining.lastIndexOf(' ', 2000)
                    if (lastSpace > -1)
                      chunkSize = lastSpace
                  }
                }

                const chunk = remaining.slice(0, chunkSize)
                await channel.send(chunk)
                remaining = remaining.slice(chunkSize).trim()
              }
            }
          }
        }
      }
      catch (error) {
        log.withError(error as Error).error('Failed to send response to Discord')
      }
    })

    // Set up Discord event handlers
    this.discordClient.once(Events.ClientReady, async (readyClient) => {
      log.log(`Discord bot ready! User: ${readyClient.user.tag}`)
      // Register commands dynamically using the authenticated client's ID and token
      await registerCommands(this.discordToken, readyClient.user.id)
    })

    // Handle text messages from Discord
    this.discordClient.on(Events.MessageCreate, async (message) => {
      if (message.author.bot)
        return

      const isDM = !message.guild
      const isMentioned = this.discordClient.user && message.mentions.has(this.discordClient.user)

      // Respond if the bot is mentioned OR if it's a DM
      if (isMentioned || isDM) {
        const rawContent = message.content
        const content = isMentioned
          ? rawContent.replace(/<@!?\d+>/g, '').trim()
          : rawContent.trim()

        if (!content)
          return

        log.log(`Received text message from ${message.author.tag} in ${isDM ? 'DM' : message.channelId}`)

        const discordContext: Discord = {
          channelId: message.channelId,
          guildId: message.guildId ?? undefined,
          guildName: message.guild?.name ?? undefined,
          guildMember: {
            id: message.author.id,
            displayName: message.member?.displayName ?? message.author.username,
            nickname: message.member?.nickname ?? message.author.username,
          },
        }
        const normalizedDiscord = normalizeDiscordMetadata(discordContext)
        const displayName = normalizedDiscord?.guildMember?.displayName

        // Enrich context and segment memory (moved from frontend)
        const serverName = normalizedDiscord?.guildName
        const contextPrefix = serverName
          ? `on server '${serverName}'`
          : 'in Direct Message'

        // Calculate sessionId based on guild or DM
        let targetSessionId = 'discord'
        if (normalizedDiscord?.guildId) {
          targetSessionId = `discord-guild-${normalizedDiscord.guildId}`
        }
        else {
          targetSessionId = `discord-dm-${normalizedDiscord?.guildMember?.id || 'unknown'}`
        }

        const discordNotice = normalizedDiscord
          ? `The input is coming from Discord channel ${normalizedDiscord.channelId} (Guild: ${normalizedDiscord.guildId ?? 'unknown'}).`
          : undefined

        this.airiClient.send({
          type: 'input:text',
          data: {
            text: content,
            textRaw: rawContent,
            overrides: {
              messagePrefix: displayName
                ? `(From Discord user ${displayName} ${contextPrefix}): `
                : `(From Discord user ${contextPrefix}): `,
              sessionId: targetSessionId,
            },
            contextUpdates: discordNotice
              ? [{
                  strategy: ContextUpdateStrategy.AppendSelf,
                  text: discordNotice,
                  content: discordNotice,
                  metadata: {
                    discord: normalizedDiscord,
                  },
                }]
              : undefined,
            discord: normalizedDiscord,
          },
        })
      }
    })

    this.discordClient.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (!interaction.isChatInputCommand())
        return

      log.log(`Interaction received: /${interaction.commandName} from ${interaction.user.tag}`)

      switch (interaction.commandName) {
        case 'ping':
          await handlePing(interaction)
          break
        case 'summon':
          await this.voiceManager.handleJoinChannelCommand(interaction)
          break
      }
    })
  }

  async start(): Promise<void> {
    log.log('Starting Discord adapter...')

    try {
      // Log in to Discord if token is available
      if (this.discordToken) {
        await this.discordClient.login(this.discordToken)
        log.log('Discord adapter started successfully')
      }
      else {
        log.warn('Discord token not provided. Waiting for configuration from UI.')
      }
    }
    catch (error) {
      log.withError(error).error('Failed to start Discord adapter')
      throw error
    }
  }

  async stop(): Promise<void> {
    log.log('Stopping Discord adapter...')
    try {
      await this.discordClient.destroy()
      this.airiClient.close()
      log.log('Discord adapter stopped')
    }
    catch (error) {
      log.withError(error).error('Error stopping Discord adapter')
      throw error
    }
  }
}
