import type { TimelineOptions, TwitterCredentials, TwitterService } from '../types/twitter'

import { Client } from '@proj-airi/server-sdk'

import { logger } from '../utils/logger'

/**
 * Airi Adapter
 * Adapts the Twitter service as an Airi module
 */
export class AiriAdapter {
  private client: Client
  private twitterService: TwitterService
  private credentials: TwitterCredentials

  constructor(twitterService: TwitterService, options: {
    url?: string
    token?: string
    credentials: TwitterCredentials
  }) {
    this.twitterService = twitterService
    this.credentials = options.credentials

    this.client = new Client({
      url: options.url,
      name: 'twitter-module',
      token: options.token,
      possibleEvents: [
        // Define event types this module can handle
        'twitter:login',
        'twitter:getTimeline',
        'twitter:getTweetDetails',
        'twitter:searchTweets',
        'twitter:getUserProfile',
        'twitter:followUser',
        'twitter:likeTweet',
        'twitter:retweet',
        'twitter:postTweet',
      ],
    })

    this.setupEventHandlers()
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Login handler
    this.client.onEvent('twitter:login', async (event) => {
      try {
        const credentials = event.data.credentials as TwitterCredentials || this.credentials
        const success = await this.twitterService.login(credentials)
        this.client.send({
          type: 'twitter:loginResult',
          data: { success },
        })
      }
      catch (error) {
        this.client.send({
          type: 'twitter:error',
          data: { error: error.message, operation: 'login' },
        })
      }
    })

    // Timeline handler
    this.client.onEvent('twitter:getTimeline', async (event) => {
      try {
        const options = event.data.options as TimelineOptions || {}
        const tweets = await this.twitterService.getTimeline(options)
        this.client.send({
          type: 'twitter:timelineResult',
          data: { tweets },
        })
      }
      catch (error) {
        this.client.send({
          type: 'twitter:error',
          data: { error: error.message, operation: 'getTimeline' },
        })
      }
    })

    // Other event handlers...
  }

  /**
   * Start the adapter
   */
  async start(): Promise<void> {
    // Initialization logic can be added here
    logger.airi.log('Airi Twitter adapter started')
  }
}
