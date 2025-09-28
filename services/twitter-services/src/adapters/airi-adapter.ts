/**
 * Airi Adapter
 * Adapts the Twitter service as an Airi module
 */
import type { Context } from '../core/browser/context'
import type { TwitterServices } from '../types/services'

import { Client } from '@proj-airi/server-sdk'

import { useTwitterTimelineServices } from '../core/services/timeline'
import { useTwitterTweetServices } from '../core/services/tweet'
import { useTwitterUserServices } from '../core/services/user'
import { logger } from '../utils/logger'

export interface AiriAdapterConfig {
  url?: string
  token?: string
  credentials: {
    apiKey?: string
    apiSecret?: string
    accessToken?: string
    accessTokenSecret?: string
  }
}

export class AiriAdapter {
  private client: Client
  private ctx: Context
  private twitterServices: TwitterServices

  constructor(ctx: Context, config: AiriAdapterConfig) {
    this.ctx = ctx
    this.client = new Client({
      name: 'twitter',
      url: config.url || 'ws://localhost:6121/ws',
      token: config.token,
      possibleEvents: [
        'module:authenticate',
        'module:authenticated',
        'module:announce',
        'ui:configure',
        'input:text',
      ],
    })

    this.twitterServices = {
      timeline: useTwitterTimelineServices(this.ctx),
      tweet: useTwitterTweetServices(this.ctx),
      user: useTwitterUserServices(this.ctx),
    }

    // Set up event handlers
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle configuration from UI
    this.client.onEvent('ui:configure', async (event) => {
      if (event.data.moduleName === 'twitter') {
        logger.main.log('Received configuration from UI for Twitter module')
        logger.main.log('Twitter configuration received:', event.data.config)

        // Update credentials from configuration if provided
        if (event.data.config.accessToken && event.data.config.accessTokenSecret) {
          // Update credentials in memory, actual re-authentication would depend on implementation
          logger.main.log('Twitter credentials updated from configuration')
        }
      }
    })

    // Handle input from AIRI system
    this.client.onEvent('input:text', async (event) => {
      logger.main.log('Received input from AIRI system:', event.data.text)
      // Process Twitter-related commands
      await this.handleInput(event.data.text)
    })

    // Handle authentication
    this.client.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        logger.main.log('Twitter module authenticated with AIRI server')
      }
      else {
        logger.main.warn('Twitter module authentication failed')
      }
    })
  }

  private async handleInput(input: string): Promise<void> {
    try {
      // Parse and handle Twitter commands
      // For now, we'll just log the input and send a response back
      logger.main.log('Processing Twitter command:', input)

      // Example: Handle commands like "post tweet: Hello world"
      if (input.toLowerCase().includes('tweet') && input.toLowerCase().includes('post')) {
        const tweetText = input.replace(/.*?:\s*/, '') // Extract text after colon
        await this.twitterServices.tweet.postTweet(tweetText)
        logger.main.log('Posted tweet:', tweetText)
      }
      // Add more command handling as needed

      // Send response back to AIRI
      this.client.send({
        type: 'input:text',
        data: {
          text: `Processed Twitter command: ${input}`,
        },
      })
    }
    catch (error) {
      logger.main.errorWithError('Error handling input:', error)
      this.client.send({
        type: 'error',
        data: {
          message: `Error processing Twitter command: ${error.message}`,
        },
      })
    }
  }

  /**
   * Start the AiriAdapter and connect to the AIRI server
   */
  async start(): Promise<void> {
    logger.main.log('Starting Airi adapter for Twitter...')
    try {
      await this.client.connect()
      logger.main.log('Airi adapter for Twitter started successfully')
    }
    catch (error) {
      logger.main.errorWithError('Failed to start Airi adapter for Twitter:', error)
      throw error
    }
  }

  /**
   * Stop the AiriAdapter and disconnect from the AIRI server
   */
  async stop(): Promise<void> {
    logger.main.log('Stopping Airi adapter for Twitter...')
    try {
      this.client.close()
      logger.main.log('Airi adapter for Twitter stopped')
    }
    catch (error) {
      logger.main.errorWithError('Error stopping Airi adapter for Twitter:', error)
      throw error
    }
  }
}
