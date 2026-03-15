import type { Context } from '../core/browser/context'
import type { Tweet } from '../core/services/tweet'
import type { TwitterServices } from '../types/services'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { z } from 'zod'

import { useTwitterTimelineServices } from '../core/services/timeline'
import { useTwitterTweetServices } from '../core/services/tweet'
import { useTwitterUserServices } from '../core/services/user'
import { errorToMessage } from '../utils/error'
import { logger } from '../utils/logger'

/**
 * MCP Protocol Adapter
 * Adapts the Twitter service to MCP protocol using official MCP SDK
 * Implements HTTP server using H3.js
 */
export class MCPAdapter {
  private mcpServer: McpServer
  private app: ReturnType<typeof createApp>
  private server: ReturnType<typeof createServer> | null = null
  private port: number
  private activeTransports: SSEServerTransport[] = []
  private extraResourceInfo: string[] = []
  private ctx: Context

  private twitterServices: TwitterServices

  constructor(port: number = 8080, ctx: Context) {
    this.port = port
    this.ctx = ctx

    this.twitterServices = {
      timeline: useTwitterTimelineServices(this.ctx),
      tweet: useTwitterTweetServices(this.ctx),
      user: useTwitterUserServices(this.ctx),
    }

    // Create MCP server
    this.mcpServer = new McpServer({
      name: 'Twitter Service',
      version: '1.0.0',
    })

    // Create H3 app
    this.app = createApp()

    // Configure resources and tools
    this.configureServer()

    // Set up H3 routes
    this.setupRoutes()
  }

  /**
   * Configure MCP server resources and tools
   */
  private configureServer(): void {
    logger.mcp.debug('Configuring MCP server resources and tools...')

    // Add timeline resource with improved registration
    this.mcpServer.resource(
      'timeline',
      new ResourceTemplate('twitter://timeline/{count}', {
        list: async () => {
          logger.mcp.debug('Listing available timeline resources')
          return {
            resources: [{
              name: 'timeline',
              uri: 'twitter://timeline/10', // Default number of tweets
              description: 'Tweet timeline',
            }],
          }
        },
      }),
      async (uri: URL, { count }: { count?: string }) => {
        try {
          logger.mcp.withField('uri', uri.toString()).withField('count', count || 'default').debug('Getting timeline')

          const tweets = await useTwitterTimelineServices(this.ctx).getTimeline({
            count: count ? Number.parseInt(count) : undefined,
          })

          logger.mcp.withField('tweetCount', tweets.length).debug('Successfully retrieved timeline tweets')
          logger.mcp.withFields({ tweets }).debug('Tweets')

          return {
            contents: tweets.map((tweet: Tweet) => ({
              uri: `twitter://tweet/${tweet.id}`,
              text: `Tweet by @${tweet.author.username} (${tweet.author.displayName}):\n${tweet.text}`,
            })),
          }
        }
        catch (error) {
          logger.mcp.errorWithError('Failed to get timeline:', error)
          return { contents: [] }
        }
      },
    )

    // Add tweet details resource
    this.mcpServer.resource(
      'tweet',
      new ResourceTemplate('twitter://tweet/{id}', { list: undefined }),
      async (uri: URL, { id }) => {
        try {
          const tweet = await this.twitterServices.tweet.getTweetDetails(id as string)

          return {
            contents: [{
              uri: uri.href,
              text: `Tweet by @${tweet.author.username} (${tweet.author.displayName}):\n${tweet.text}`,
            }],
          }
        }
        catch (error) {
          logger.mcp.errorWithError('Error fetching tweet details:', error)
          return { contents: [] }
        }
      },
    )

    // Add user profile resource
    this.mcpServer.resource(
      'profile',
      new ResourceTemplate('twitter://user/{username}', { list: undefined }),
      async (uri, { username }) => {
        try {
          const profile = await this.twitterServices.user.getUserProfile(username as string)

          return {
            contents: [{
              uri: uri.href,
              text: `Profile for @${profile.username} (${profile.displayName})\n${profile.bio || ''}`,
            }],
          }
        }
        catch (error) {
          logger.mcp.errorWithError('Error fetching user profile:', error)
          return { contents: [] }
        }
      },
    )

    // Add login tool
    this.mcpServer.tool(
      'login',
      {},
      async () => {
        try {
          const success = await this.twitterServices.auth.login()

          return {
            content: [{
              type: 'text',
              text: success
                ? 'Successfully loaded login state from session file! If you logged in manually, auto-monitoring is set up to save your session.'
                : 'No valid session file found. Please log in manually in the browser, the system will automatically save your session.',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to check login status: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add post tweet tool
    this.mcpServer.tool(
      'post-tweet',
      {
        content: z.string(),
        replyTo: z.string().optional(),
        media: z.array(z.string()).optional(),
      },
      async ({ content, replyTo, media }) => {
        try {
          const tweetId = await this.twitterServices.tweet.postTweet(content, {
            inReplyTo: replyTo,
            media,
          })

          return {
            content: [{
              type: 'text',
              text: `Successfully posted tweet: ${tweetId}`,
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to post tweet: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add like tweet tool
    this.mcpServer.tool(
      'like-tweet',
      { tweetId: z.string() },
      async ({ tweetId }) => {
        try {
          const success = await this.twitterServices.tweet.likeTweet(tweetId)

          return {
            content: [{
              type: 'text',
              text: success ? 'Successfully liked tweet' : 'Failed to like tweet',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to like tweet: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add retweet tool
    this.mcpServer.tool(
      'retweet',
      { tweetId: z.string() },
      async ({ tweetId }) => {
        try {
          const success = await this.twitterServices.tweet.retweet(tweetId)

          return {
            content: [{
              type: 'text',
              text: success ? 'Successfully retweeted' : 'Failed to retweet',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to retweet: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add save session tool
    this.mcpServer.tool(
      'save-session',
      {},
      async () => {
        try {
          const success = await this.twitterServices.auth.saveSession()

          return {
            content: [{
              type: 'text',
              text: success
                ? 'Successfully saved browser session to file. This session will be loaded automatically next time.'
                : 'Failed to save browser session',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to save session: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add search tool
    this.mcpServer.tool(
      'search',
      {
        query: z.string(),
        count: z.number().optional(),
        filter: z.enum(['latest', 'photos', 'videos', 'top']).optional(),
      },
      async ({ query, count, filter }) => {
        try {
          const results = await this.twitterServices.tweet.searchTweets(query, { count, filter })

          return {
            content: [{
              type: 'text',
              text: `Search results: ${results.length} tweets`,
            }],
            resources: results.map((tweet: Tweet) => `twitter://tweet/${tweet.id}`),
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Search failed: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add refresh timeline tool
    this.mcpServer.tool(
      'refresh-timeline',
      {
        count: z.number().optional(),
        includeReplies: z.boolean().optional(),
        includeRetweets: z.boolean().optional(),
      },
      async ({ count, includeReplies, includeRetweets }) => {
        try {
          const tweets = await this.twitterServices.timeline.getTimeline({
            count,
            includeReplies,
            includeRetweets,
          })

          return {
            content: [{
              type: 'text',
              text: `Successfully refreshed timeline, retrieved ${tweets.length} tweets`,
            }],
            resources: tweets.map((tweet: Tweet) => `twitter://tweet/${tweet.id}`),
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to refresh timeline: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // Add get my profile tool
    this.mcpServer.tool(
      'get-my-profile',
      {
        username: z.string().optional(),
      },
      async ({ username }) => {
        try {
          let profileUsername = username

          // If no username provided, try to get from current URL
          if (!profileUsername) {
            const currentUrl = await this.twitterServices.auth.getCurrentUrl()
            profileUsername = this.extractUsernameFromUrl(currentUrl)
          }

          // If we still don't have a username, return an error
          if (!profileUsername) {
            return {
              content: [{
                type: 'text',
                text: `Failed to get profile: Please provide a username or navigate to a profile page`,
              }],
              isError: true,
            }
          }

          const profile = await this.twitterServices.user.getUserProfile(profileUsername)

          return {
            content: [{
              type: 'text',
              text: `Profile Information:\n`
                + `Username: @${profile.username}\n`
                + `Display Name: ${profile.displayName}\n`
                + `Bio: ${profile.bio || 'Not set'}\n`
                + `Followers: ${profile.followersCount || 'N/A'}\n`
                + `Following: ${profile.followingCount || 'N/A'}\n`
                + `Tweets: ${profile.tweetCount || 'N/A'}\n`
                + `Joined: ${profile.joinDate || 'N/A'}`,
            }],
            resources: [`twitter://user/${profile.username}`],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `Failed to get profile: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * Extract username from Twitter URL
   * @param url Twitter URL
   * @returns Username or undefined if not a profile URL
   */
  private extractUsernameFromUrl(url: string): string | undefined {
    try {
      const parsedUrl = new URL(url)
      if (parsedUrl.hostname === 'x.com') {
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
        if (pathParts.length > 0 && !['search', 'explore', 'home', 'notifications', 'messages'].includes(pathParts[0])) {
          return pathParts[0]
        }
      }
      return undefined
    }
    catch (e) {
      logger.mcp.errorWithError('Error extracting username from URL:', e)
      return undefined
    }
  }

  /**
   * Set up H3 routes
   */
  private setupRoutes(): void {
    const router = createRouter()

    // Set up CORS
    router.use('*', defineEventHandler((event) => {
      event.node.res.setHeader('Access-Control-Allow-Origin', '*')
      event.node.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      event.node.res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (event.node.req.method === 'OPTIONS') {
        event.node.res.statusCode = 204
        event.node.res.end()
      }
    }))

    // SSE endpoint
    router.get('/sse', defineEventHandler(async (event) => {
      const { req, res } = event.node

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // Create SSE transport
      const transport = new SSEServerTransport('/messages', res)
      this.activeTransports.push(transport)

      // Clean up when client disconnects
      req.on('close', () => {
        const index = this.activeTransports.indexOf(transport)
        if (index !== -1) {
          this.activeTransports.splice(index, 1)
        }
      })

      // Connect to MCP server
      await this.mcpServer.connect(transport)
    }))

    // Messages endpoint - receive client requests
    router.post('/messages', defineEventHandler(async (event) => {
      if (this.activeTransports.length === 0) {
        logger.mcp.warn('Received message request but no active SSE connections')
        event.node.res.statusCode = 503
        return { error: 'No active SSE connections' }
      }

      try {
        // Parse request body
        const body = await readBody(event)
        logger.mcp.debug(`Received MCP request: ${JSON.stringify(body)}`)

        // Simple handling - send to most recent transport
        // Note: In production, should use session ID to route to correct transport
        const transport = this.activeTransports[this.activeTransports.length - 1]

        // Manually handle POST message, as H3 is not Express-compatible
        const response = await transport.handleMessage(body)

        // Log response for debugging
        logger.mcp.debug(`MCP response: ${JSON.stringify(response)}`)

        return response
      }
      catch (error) {
        logger.mcp.errorWithError('Error handling MCP message:', error)
        event.node.res.statusCode = 500
        return { error: errorToMessage(error) }
      }
    }))

    // Root path - provide service info
    router.get('/', defineEventHandler(() => {
      return {
        name: 'Twitter MCP Service',
        version: '1.0.0',
        endpoints: {
          sse: '/sse',
          messages: '/messages',
        },
      }
    }))

    // Use router
    this.app.use(router)
  }

  /**
   * Start MCP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server !== null) {
        logger.mcp.warn('MCP server is already running')
        resolve()
        return
      }

      try {
        // Create Node.js HTTP server
        this.server = createServer(toNodeListener(this.app))

        // Add error event handlers
        this.server.on('error', (error) => {
          logger.mcp.errorWithError('MCP server error:', error)
          reject(error)
        })

        // Log available resources for debugging
        logger.mcp.debug('Registered MCP resources:')
        logger.mcp.debug('- twitter://timeline/{count}: Get tweet timeline')
        logger.mcp.debug('- twitter://tweet/{id}: Get single tweet details')
        logger.mcp.debug('- twitter://user/{username}: Get user profile information')
        if (this.extraResourceInfo?.length) {
          this.extraResourceInfo.forEach((info) => {
            logger.mcp.debug(`- ${info}`)
          })
        }

        this.server.listen(this.port, () => {
          const serverAddress = `http://localhost:${this.port}`
          logger.mcp.log(`MCP server started at: ${serverAddress}`)
          logger.mcp.log(`SSE endpoint: ${serverAddress}/sse`)
          logger.mcp.log(`Messages endpoint: ${serverAddress}/messages`)
          resolve()
        })
      }
      catch (error) {
        logger.mcp.errorWithError('Error starting MCP server:', error)
        reject(error)
      }
    })
  }

  /**
   * Stop MCP server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server === null) {
        logger.mcp.warn('MCP server is not running')
        resolve()
        return
      }

      try {
        this.server.close(() => {
          this.server = null
          logger.mcp.log('MCP server stopped')
          resolve()
        })
      }
      catch (error) {
        logger.mcp.errorWithError('Error stopping MCP server:', error)
        this.server = null
        resolve()
      }
    })
  }
}

// h3 utility function: read body from event
async function readBody(event: any): Promise<any> {
  const buffers = []
  for await (const chunk of event.node.req) {
    buffers.push(chunk)
  }
  const data = Buffer.concat(buffers).toString()
  return JSON.parse(data)
}
