import type { SatoriEvent } from '../types/satori'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { Client as AiriClient } from '@proj-airi/server-sdk'

import { SatoriClient } from '../client/satori-client'

const log = useLogg('SatoriAdapter')

export interface SatoriAdapterConfig {
  satoriWsUrl?: string
  satoriApiUrl?: string
  satoriToken?: string
  airiToken?: string
  airiUrl?: string
}

// Define Satori configuration type
interface SatoriConfig {
  url?: string
  token?: string
  enabled?: boolean
}

// Type guard to safely validate the configuration object
function isSatoriConfig(config: unknown): config is SatoriConfig {
  if (typeof config !== 'object' || config === null)
    return false
  const c = config as Record<string, unknown>
  return (typeof c.url === 'string' || typeof c.url === 'undefined')
    && (typeof c.token === 'string' || typeof c.token === 'undefined')
    && (typeof c.enabled === 'boolean' || typeof c.enabled === 'undefined')
}

export class SatoriAdapter {
  private airiClient: AiriClient
  private satoriClient: SatoriClient
  private satoriWsUrl: string
  private satoriApiUrl: string
  private satoriToken?: string
  private isReconnecting = false
  // Track message context for replies
  private messageContexts = new Map<string, {
    platform: string
    selfId: string
    channelId: string
    guildId?: string
    userId: string
  }>()

  constructor(config: SatoriAdapterConfig) {
    this.satoriWsUrl = config.satoriWsUrl || env.SATORI_WS_URL || 'ws://localhost:5140/v1/events'
    this.satoriApiUrl = config.satoriApiUrl || env.SATORI_API_URL || 'http://localhost:5140'
    this.satoriToken = config.satoriToken || env.SATORI_TOKEN

    // Initialize Satori client
    this.satoriClient = new SatoriClient({
      url: this.satoriWsUrl,
      apiBaseUrl: this.satoriApiUrl,
      token: this.satoriToken,
    })

    // Initialize AIRI client
    this.airiClient = new AiriClient({
      name: 'satori-bot',
      possibleEvents: [
        'input:text',
        'input:text:voice',
        'input:voice',
        'ui:configure',
      ],
      token: config.airiToken,
      url: config.airiUrl,
    })

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle configuration from AIRI UI
    this.airiClient.onEvent('ui:configure', async (event) => {
      if (event.data.moduleName === 'satori') {
        if (this.isReconnecting) {
          log.warn('A reconnect is already in progress, skipping this configuration event.')
          return
        }
        this.isReconnecting = true
        try {
          log.log('Received Satori configuration:', event.data.config)

          if (isSatoriConfig(event.data.config)) {
            const config = event.data.config as SatoriConfig
            const { url, token, enabled } = config

            if (enabled === false) {
              if (this.satoriClient.isConnected()) {
                log.log('Disabling Satori bot as per configuration...')
                this.satoriClient.disconnect()
              }
              return
            }

            // If enabled, but no URL is provided, stop the bot if it's running.
            if (!url) {
              log.warn('Satori bot enabled, but no URL provided. Stopping bot.')
              if (this.satoriClient.isConnected()) {
                this.satoriClient.disconnect()
              }
              return
            }

            // Connect or reconnect if URL changed or client is not connected.
            if (this.satoriWsUrl !== url || !this.satoriClient.isConnected()) {
              this.satoriWsUrl = url
              this.satoriToken = token
              if (this.satoriClient.isConnected()) {
                log.log('Reconnecting Satori client with new configuration...')
                this.satoriClient.disconnect()
              }
              log.log('Connecting Satori client...')
              this.satoriClient = new SatoriClient({
                url: this.satoriWsUrl,
                apiBaseUrl: this.satoriApiUrl,
                token: this.satoriToken,
              })
              this.setupSatoriHandlers()
              await this.satoriClient.connect()
              log.log('Satori client connected.')
            }
          }
          else {
            log.warn('Invalid Satori configuration received, skipping...')
          }
        }
        catch (error) {
          log.withError(error as Error).error('Failed to apply Satori configuration.')
        }
        finally {
          this.isReconnecting = false
        }
      }
    })

    // Handle output from AIRI system to send to Satori platforms
    this.airiClient.onEvent('output:gen-ai:chat:complete', async (event) => {
      const message = event.data.message
      log.log('Received output from AIRI system:', message.content)

      // Get context from the input source
      const satoriContext = (event.data as any).satori
      if (satoriContext) {
        const { platform, selfId, channelId } = satoriContext

        // Get message content
        const content = typeof message.content === 'string'
          ? message.content
          : Array.isArray(message.content)
            ? message.content.map(part => 'text' in part ? part.text : '').join('')
            : ''

        if (content) {
          // Send reply back to the original channel
          await this.satoriClient.sendMessage(
            platform,
            selfId,
            channelId,
            content,
          )

          log.log(`Sent reply to ${platform}:${selfId}:${channelId}`)
        }
      }
      else {
        log.warn('No Satori context found in AIRI output, cannot send reply')
      }
    })

    this.setupSatoriHandlers()
  }

  private setupSatoriHandlers(): void {
    // Handle READY event from Satori
    this.satoriClient.onReady(async (ready) => {
      log.log('Satori client ready with logins:', ready.logins)

      // Log all connected platforms
      for (const login of ready.logins) {
        log.log(`Connected to platform: ${login.platform} (${login.self_id})`)
      }
    })

    // Handle message-created event
    this.satoriClient.on('message-created', async (event) => {
      await this.handleMessageCreated(event)
    })

    // Handle other events as needed
    this.satoriClient.on('*', async (event) => {
      log.log(`Received Satori event: ${event.type}`)
    })
  }

  private async handleMessageCreated(event: SatoriEvent): Promise<void> {
    const message = event.message
    const user = event.user
    const channel = event.channel

    if (!message || !user || !channel) {
      log.warn('Incomplete message event received')
      return
    }

    // Ignore messages from the bot itself
    if (user.is_bot) {
      return
    }

    log.log(`Message from ${user.name || user.id} in channel ${channel.id}: ${message.content}`)

    // Store context for reply tracking
    const contextKey = `${event.platform}:${event.self_id}:${channel.id}:${user.id}`
    this.messageContexts.set(contextKey, {
      platform: event.platform,
      selfId: event.self_id,
      channelId: channel.id,
      guildId: event.guild?.id,
      userId: user.id,
    })

    // Send message to AIRI for processing with satori context
    const inputData: any = {
      text: message.content,
    }

    // Add satori context as a separate property (not part of the standard event data)
    inputData.satori = {
      platform: event.platform,
      selfId: event.self_id,
      channelId: channel.id,
      guildId: event.guild?.id,
      userId: user.id,
      userName: user.name || user.nick || user.id,
      messageId: message.id,
    }

    this.airiClient.send({
      type: 'input:text',
      data: inputData,
    })
  }

  async start(): Promise<void> {
    log.log('Starting Satori adapter...')

    try {
      // Connect to Satori server if URL is available
      if (this.satoriWsUrl) {
        await this.satoriClient.connect()
        log.log('Satori adapter started successfully')
      }
      else {
        log.warn('Satori WebSocket URL not provided. Waiting for configuration from UI.')
      }
    }
    catch (error) {
      log.withError(error as Error).error('Failed to start Satori adapter')
      throw error
    }
  }

  async stop(): Promise<void> {
    log.log('Stopping Satori adapter...')
    try {
      this.satoriClient.disconnect()
      this.airiClient.close()
      log.log('Satori adapter stopped')
    }
    catch (error) {
      log.withError(error as Error).error('Error stopping Satori adapter')
      throw error
    }
  }
}
