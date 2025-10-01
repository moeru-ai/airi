/**
 * Airi Adapter
 * Adapts the X service as an Airi module
 */
import type { Context } from '../core/browser/context'
import type { Tweet } from '../core/services/tweet'
import type { TwitterServices } from '../types/services'

import * as fs from 'node:fs/promises'

import { Client } from '@proj-airi/server-sdk'

import { getDefaultConfig } from '../config/types'
import { initBrowser, useContext, useSessionFileAsync } from '../core/browser/context'
import { useTwitterTimelineServices } from '../core/services/timeline'
import { useTwitterTweetServices } from '../core/services/tweet'
import { useTwitterUserServices } from '../core/services/user'
import { parseTwitterCommand } from '../parsers/command-parser'
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

export interface XConfig {
  apiKey?: string
  apiSecret?: string
  accessToken?: string
  accessTokenSecret?: string
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
      name: 'x',
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
      if (event.data && event.data.moduleName === 'x' && event.data.config && isXConfig(event.data.config)) {
        logger.main.log('Received configuration from UI for X module')
        logger.main.log('Twitter configuration received:', event.data.config)

        // Check if any credentials have changed
        const newCreds = event.data.config
        const credKeys: (keyof AiriAdapterConfig['credentials'])[] = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret']
        const credsChanged = credKeys.some(key => key in newCreds && newCreds[key] !== this.config.credentials[key])

        if (credsChanged) {
          // Update the configuration with the new credentials
          this.config.credentials = {
            ...this.config.credentials,
            ...newCreds,
          }

          logger.main.log('X credentials updated from configuration, re-initializing session.')

          // If Twitter API keys are provided, we might need to re-authenticate
          // For now, we'll clear the session to force re-authentication
          // since the session might be tied to the previous API credentials
          try {
            // Close existing browser context and create a new one with fresh session
            if (this.ctx.browser)
              await this.ctx.browser.close()
            await this.reinitializeBrowserContext()

            logger.main.log('Browser context reinitialized with new credentials')
          }
          catch (error) {
            logger.main.errorWithError('Failed to reinitialize browser context with new credentials:', error)
          }
        }
      }
      else if (event.data && event.data.moduleName === 'x') {
        // Log error if config is not valid
        logger.main.error('Invalid configuration received for X module')
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
        logger.main.log('X module authenticated with AIRI server')
      }
      else {
        logger.main.warn('X module authentication failed')
      }
    })
  }

  private async handlePostTweet(content: string): Promise<void> {
    if (content) {
      await this.twitterServices.tweet.postTweet(content)
      logger.main.log('Posted tweet:', content)
    }
    else {
      throw new Error('Tweet text is empty. Please provide text to post.')
    }
  }

  private async handleSearchTweets(content: string): Promise<boolean> {
    if (content) {
      const tweets = await this.twitterServices.tweet.searchTweets(content)
      logger.main.log(`Found ${tweets.length} tweets for query: ${content}`)
      // Return results to the user
      this.client.send({
        type: 'input:text',
        data: {
          text: `Found ${tweets.length} tweets for '${content}':
${tweets.slice(0, 5).map((t: Tweet) => `- ${t.text.substring(0, 100)}...`).join('\n')}`,
        },
      })
      return true
    }
    else {
      throw new Error('Search query is empty. Please provide a query to search.')
    }
  }

  private async handleLikeTweet(content: string): Promise<void> {
    if (content) {
      await this.twitterServices.tweet.likeTweet(content)
      logger.main.log(`Liked tweet: ${content}`)
    }
    else {
      throw new Error('Tweet ID is empty. Please provide a tweet ID to like.')
    }
  }

  private async handleRetweet(content: string): Promise<void> {
    if (content) {
      await this.twitterServices.tweet.retweet(content)
      logger.main.log(`Retweeted: ${content}`)
    }
    else {
      throw new Error('Tweet ID is empty. Please provide a tweet ID to retweet.')
    }
  }

  private async handleGetUser(content: string): Promise<boolean> {
    if (content) {
      const userProfile = await this.twitterServices.user.getUserProfile(content)
      logger.main.log(`Retrieved profile for user: @${content}`)
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
      return true
    }
    else {
      throw new Error('Username is empty. Please provide a username to retrieve.')
    }
  }

  private async handleGetTimeline(count: number): Promise<boolean> {
    const timelineOptions = { count }
    const tweets = await this.twitterServices.timeline.getTimeline(timelineOptions)
    logger.main.log(`Retrieved ${tweets.length} tweets from timeline`)
    // Return timeline to the user
    this.client.send({
      type: 'input:text',
      data: {
        text: `Latest ${tweets.length} tweets from your timeline:
${tweets.map((t: Tweet) => `- ${t.author.displayName}: ${t.text.substring(0, 80)}...`).join('\n')}`,
      },
    })
    return true
  }

  private async handleInput(input: string): Promise<void> {
    let responseSent = false
    try {
      // Parse and handle X commands
      logger.main.log('Processing X command:', input)

      // Parse the command using the dedicated parsing function
      const parsedCommand = parseTwitterCommand(input)

      if (!parsedCommand) {
        throw new Error(`Unknown X command: ${input}. Supported commands: "post tweet: <text>", "search tweets: <query>", "like tweet: <tweetId>", "retweet: <tweetId>", "get user: <username>", "get timeline [count: N]"`)
      }

      // Execute the appropriate command handler based on the parsed command
      switch (parsedCommand.command) {
        case 'post tweet':
          await this.handlePostTweet(parsedCommand.content)
          break

        case 'search tweets':
          responseSent = await this.handleSearchTweets(parsedCommand.content)
          break

        case 'like tweet':
          await this.handleLikeTweet(parsedCommand.content)
          break

        case 'retweet':
          await this.handleRetweet(parsedCommand.content)
          break

        case 'get user':
          responseSent = await this.handleGetUser(parsedCommand.content)
          break

        case 'get timeline':
          responseSent = await this.handleGetTimeline(parsedCommand.count || 10)
          break

        default:
          // This should not happen if parseTwitterCommand is working correctly
          throw new Error(`Unknown X command: ${input}`)
      }

      // Only send the original processing response if we haven't already sent a specific response
      if (!responseSent) {
        this.client.send({
          type: 'input:text',
          data: {
            text: `Processed X command: ${input}`,
          },
        })
      }
    }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.main.errorWithError('Error handling input:', error)
      this.client.send({
        type: 'input:text',
        data: {
          text: `Error processing X command: ${errorMessage}`,
        },
      })
    }
  }

  /**
   * Start the AiriAdapter and connect to the AIRI server
   */
  async start(): Promise<void> {
    logger.main.log('Starting Airi adapter for X...')
    try {
      await this.client.connect()
      logger.main.log('Airi adapter for X started successfully')
    }
    catch (error) {
      logger.main.errorWithError('Failed to start Airi adapter for X:', error)
      throw error
    }
  }

  /**
   * Stop the AiriAdapter and disconnect from the AIRI server
   */
  async stop(): Promise<void> {
    logger.main.log('Stopping Airi adapter for X...')
    try {
      this.client.close()
      logger.main.log('Airi adapter for X stopped')
    }
    catch (error) {
      logger.main.errorWithError('Error stopping Airi adapter for X:', error)
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

function isXConfig(config: unknown): config is XConfig {
  if (typeof config !== 'object' || config === null)
    return false
  const c = config as Record<string, unknown>
  const checkStringOrUndefined = (key: string) => typeof c[key] === 'string' || typeof c[key] === 'undefined'

  return checkStringOrUndefined('apiKey')
    && checkStringOrUndefined('apiSecret')
    && checkStringOrUndefined('accessToken')
    && checkStringOrUndefined('accessTokenSecret')
}
