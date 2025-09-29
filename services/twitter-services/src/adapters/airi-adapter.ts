/**
 * Airi Adapter
 * Adapts the Twitter service as an Airi module
 */
import type { Context } from '../core/browser/context'
import type { TwitterServices } from '../types/services'

import * as fs from 'node:fs/promises'

import { Client } from '@proj-airi/server-sdk'

import { getDefaultConfig } from '../config/types'
import { initBrowser, useContext, useSessionFileAsync } from '../core/browser/context'
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
  private config: AiriAdapterConfig

  constructor(ctx: Context, config: AiriAdapterConfig) {
    this.ctx = ctx
    this.config = config
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
      if (event.data && event.data.moduleName === 'twitter' && event.data.config) {
        logger.main.log('Received configuration from UI for Twitter module')
        logger.main.log('Twitter configuration received:', event.data.config)

        // Update credentials from configuration if provided
        if (event.data.config.accessToken && event.data.config.accessTokenSecret) {
          // Update the configuration with the new credentials
          this.config.credentials = {
            ...this.config.credentials,
            ...event.data.config,
          }

          logger.main.log('Twitter credentials updated from configuration')

          // If Twitter API keys are provided, we might need to re-authenticate
          // For now, we'll clear the session to force re-authentication
          // since the session might be tied to the previous API credentials
          try {
            // Close existing browser context and create a new one with fresh session
            await this.ctx.browser.close()
            await this.reinitializeBrowserContext()

            logger.main.log('Browser context reinitialized with new credentials')
          }
          catch (error) {
            logger.main.errorWithError('Failed to reinitialize browser context with new credentials:', error)
          }
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

      // Handle commands based on explicit prefixes for better reliability
      const normalizedInput = input.trim().toLowerCase()

      if (normalizedInput.startsWith('post tweet:')) {
        // Handle "post tweet: <text>" command
        const tweetText = input.substring('post tweet:'.length).trim()
        if (tweetText) {
          await this.twitterServices.tweet.postTweet(tweetText)
          logger.main.log('Posted tweet:', tweetText)
        }
        else {
          throw new Error('Tweet text is empty. Please provide text to post.')
        }
      }
      else if (normalizedInput.startsWith('search tweets:')) {
        // Handle "search tweets: <query>" command
        const query = input.substring('search tweets:'.length).trim()
        if (query) {
          const tweets = await this.twitterServices.tweet.searchTweets(query)
          logger.main.log(`Found ${tweets.length} tweets for query: ${query}`)
          // Return results to the user
          this.client.send({
            type: 'input:text',
            data: {
              text: `Found ${tweets.length} tweets for '${query}':
${tweets.slice(0, 5).map((t: any) => `- ${t.text.substring(0, 100)}...`).join('\n')}`,
            },
          })
        }
        else {
          throw new Error('Search query is empty. Please provide a query to search.')
        }
      }
      else if (normalizedInput.startsWith('like tweet:')) {
        // Handle "like tweet: <tweetId>" command
        const tweetId = input.substring('like tweet:'.length).trim()
        if (tweetId) {
          await this.twitterServices.tweet.likeTweet(tweetId)
          logger.main.log(`Liked tweet: ${tweetId}`)
        }
        else {
          throw new Error('Tweet ID is empty. Please provide a tweet ID to like.')
        }
      }
      else if (normalizedInput.startsWith('retweet:')) {
        // Handle "retweet: <tweetId>" command
        const tweetId = input.substring('retweet:'.length).trim()
        if (tweetId) {
          await this.twitterServices.tweet.retweet(tweetId)
          logger.main.log(`Retweeted: ${tweetId}`)
        }
        else {
          throw new Error('Tweet ID is empty. Please provide a tweet ID to retweet.')
        }
      }
      else if (normalizedInput.startsWith('get user:')) {
        // Handle "get user: <username>" command
        const username = input.substring('get user:'.length).trim()
        if (username) {
          const userProfile = await this.twitterServices.user.getUserProfile(username)
          logger.main.log(`Retrieved profile for user: @${username}`)
          // Return user info to the user
          this.client.send({
            type: 'input:text',
            data: {
              text: `User Profile for @${userProfile.username}:
Display Name: ${userProfile.displayName}
Bio: ${userProfile.bio || 'N/A'}
Followers: ${userProfile.followersCount || 0}
Following: ${userProfile.followingCount || 0}`,
            },
          })
        }
        else {
          throw new Error('Username is empty. Please provide a username to retrieve.')
        }
      }
      else if (normalizedInput.startsWith('get timeline')) {
        // Handle "get timeline" command
        const countMatch = normalizedInput.match(/count:\s*(\d+)/)
        const count = countMatch ? Number.parseInt(countMatch[1], 10) : 10

        const timelineOptions = { count }
        const tweets = await this.twitterServices.timeline.getTimeline(timelineOptions)
        logger.main.log(`Retrieved ${tweets.length} tweets from timeline`)
        // Return timeline to the user
        this.client.send({
          type: 'input:text',
          data: {
            text: `Latest ${tweets.length} tweets from your timeline:
${tweets.map((t: any) => `- ${t.author.displayName}: ${t.text.substring(0, 80)}...`).join('\n')}`,
          },
        })
      }
      else {
        throw new Error(`Unknown Twitter command: ${input}. Supported commands: "post tweet: <text>", "search tweets: <query>", "like tweet: <tweetId>", "retweet: <tweetId>", "get user: <username>", "get timeline [count: N]"`)
      }

      // Only send the original processing response if we haven't already sent a specific response
      if (!normalizedInput.startsWith('search tweets:')
        && !normalizedInput.startsWith('get user:')
        && !normalizedInput.startsWith('get timeline')) {
        this.client.send({
          type: 'input:text',
          data: {
            text: `Processed Twitter command: ${input}`,
          },
        })
      }
    }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.main.errorWithError('Error handling input:', error)
      this.client.send({
        type: 'error',
        data: {
          message: `Error processing Twitter command: ${errorMessage}`,
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

  /**
   * Reinitialize the browser context to refresh session state
   * This is needed when credentials are updated from the UI
   */
  private async reinitializeBrowserContext(): Promise<void> {
    try {
      // Clear the session file to force re-authentication with new credentials
      const sessionFile = await useSessionFileAsync()

      // Clear the session file to force re-authentication
      await fs.writeFile(
        sessionFile,
        JSON.stringify({ cookies: [], origins: [] }, null, 2),
      )

      logger.main.log('Session file cleared, re-initializing browser context')

      // Use the updated configuration with new credentials
      const config = {
        ...getDefaultConfig(),
        credentials: {
          ...getDefaultConfig().credentials,
          ...this.config.credentials,
        },
      }

      await initBrowser(config)

      // Update the context reference
      this.ctx = useContext()

      // Reinitialize services with the new context
      this.twitterServices = {
        timeline: useTwitterTimelineServices(this.ctx),
        tweet: useTwitterTweetServices(this.ctx),
        user: useTwitterUserServices(this.ctx),
      }

      logger.main.log('Browser context reinitialized successfully with new credentials')
    }
    catch (error) {
      logger.main.errorWithError('Failed to reinitialize browser context:', error)
      throw error
    }
  }
}
