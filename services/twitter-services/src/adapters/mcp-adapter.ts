import type { TwitterService } from '../types/twitter'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { z } from 'zod'

import { errorToMessage } from '../utils/error'
import { logger } from '../utils/logger'

/**
 * MCP Protocol Adapter
 * Adapts the Twitter service to MCP protocol using official MCP SDK
 * Implements HTTP server using H3.js
 */
export class MCPAdapter {
  private twitterService: TwitterService
  private mcpServer: McpServer
  private app: ReturnType<typeof createApp>
  private server: ReturnType<typeof createServer> | null = null
  private port: number
  private activeTransports: SSEServerTransport[] = []

  constructor(twitterService: TwitterService, port: number = 8080) {
    this.twitterService = twitterService
    this.port = port

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
    // Add timeline resource
    this.mcpServer.resource(
      'timeline',
      new ResourceTemplate('twitter://timeline/{count}', { list: async () => ({
        resources: [{
          name: 'timeline',
          uri: 'twitter://timeline',
          description: 'Tweet timeline',
        }],
      }) }),
      async (_uri: URL, { count }: { count?: string }) => {
        try {
          const tweets = await this.twitterService.getTimeline({
            count: count ? Number.parseInt(count) : undefined,
          })

          return {
            contents: tweets.map(tweet => ({
              uri: `twitter://tweet/${tweet.id}`,
              text: `Tweet by @${tweet.author.username} (${tweet.author.displayName}):\n${tweet.text}`,
            })),
          }
        }
        catch (error) {
          logger.mcp.errorWithError('Error fetching timeline:', error)
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
          const tweet = await this.twitterService.getTweetDetails(id as string)

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
          const profile = await this.twitterService.getUserProfile(username as string)

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
          const success = await this.twitterService.login()

          return {
            content: [{
              type: 'text',
              text: success
                ? '成功从会话文件加载登录状态！如果您是手动登录，系统已设置自动监控来保存您的会话。'
                : '没有找到有效的会话文件。请在浏览器中手动登录，系统会自动保存您的会话。',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `检查登录状态失败: ${errorToMessage(error)}` }],
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
          const tweetId = await this.twitterService.postTweet(content, {
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
          const success = await this.twitterService.likeTweet(tweetId)

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
          const success = await this.twitterService.retweet(tweetId)

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
          const success = await this.twitterService.saveSession()

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
          const results = await this.twitterService.searchTweets(query, { count, filter })

          return {
            content: [{
              type: 'text',
              text: `Search results: ${results.length} tweets`,
            }],
            resources: results.map(tweet => `twitter://tweet/${tweet.id}`),
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
        event.node.res.statusCode = 503
        return { error: 'No active SSE connections' }
      }

      try {
        // Parse request body
        const body = await readBody(event)

        // Simple handling - send to most recent transport
        // Note: In production, should use session ID to route to correct transport
        const transport = this.activeTransports[this.activeTransports.length - 1]

        // Manually handle POST message, as H3 is not Express-compatible
        const response = await transport.handleMessage(body)

        return response
      }
      catch (error) {
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
    return new Promise((resolve) => {
      // Create Node.js HTTP server
      this.server = createServer(toNodeListener(this.app))

      this.server.listen(this.port, () => {
        logger.mcp.withField('port', this.port).log('MCP server started')
        resolve()
      })
    })
  }

  /**
   * Stop MCP server
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        return resolve()
      }

      this.server.close((error) => {
        if (error) {
          reject(error)
        }
        else {
          logger.mcp.log('MCP server stopped')
          resolve()
        }
      })
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
