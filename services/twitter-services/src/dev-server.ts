import { Buffer } from 'node:buffer'
import process from 'node:process'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import * as dotenv from 'dotenv'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { z } from 'zod'

import { StagehandBrowserAdapter } from './adapters/browserbase-adapter'
import { TwitterService } from './core/twitter-service'
import { errorToMessage } from './utils/error'
import { logger } from './utils/logger'

// Load environment variables
dotenv.config()

/**
 * Development server entry point
 * Provides convenience features for development
 */
async function startDevServer() {
  const app = createApp()
  const router = createRouter()

  // Create browser and Twitter service
  const browser = new StagehandBrowserAdapter(process.env.BROWSERBASE_API_KEY || '')
  await browser.initialize({
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })

  const twitter = new TwitterService(browser)

  // Optional: If credentials are available, login
  if (process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD) {
    const success = await twitter.login({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
    })

    if (success) {
      logger.main.log('✅ Successfully logged in Twitter')
    }
    else {
      logger.main.warn('⚠️ Twitter login failed')
    }
  }

  // Create MCP server
  const mcpServer = new McpServer({
    name: 'Twitter Service (Dev)',
    version: '1.0.0-dev',
  })

  // Configure MCP resources
  mcpServer.resource(
    'timeline',
    new ResourceTemplate('twitter://timeline/{count}', { list: async () => ({
      resources: [{
        name: 'twitter-timeline',
        uri: 'twitter://timeline',
        description: 'Twitter timeline',
      }],
    }) }),
    async (_uri: URL, { count }: { count?: string }) => {
      try {
        const tweets = await twitter.getTimeline({
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
        logger.mcp.errorWithError('Get timeline error:', error)
        return { contents: [] }
      }
    },
  )

  // Configure some basic tools
  mcpServer.tool(
    'post-tweet',
    {
      content: z.string(),
    },
    async ({ content }: { content: string }) => {
      try {
        const tweetId = await twitter.postTweet(content)
        return {
          content: [{ type: 'text', text: `Successfully posted tweet: ${tweetId}` }],
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

  // Save active SSE transports
  const activeTransports: SSEServerTransport[] = []

  // Set up routes
  router.get('/', defineEventHandler(() => {
    return {
      name: 'Twitter MCP Dev Server',
      version: '1.0.0-dev',
      status: 'running',
      endpoints: {
        sse: '/sse',
        messages: '/messages',
      },
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
    activeTransports.push(transport)

    // Clean up when client disconnects
    req.on('close', () => {
      const index = activeTransports.indexOf(transport)
      if (index !== -1) {
        activeTransports.splice(index, 1)
      }
    })

    // Connect to MCP server
    await mcpServer.connect(transport)
  }))

  // Messages endpoint
  router.post('/messages', defineEventHandler(async (event) => {
    if (activeTransports.length === 0) {
      event.node.res.statusCode = 503
      return { error: 'No active SSE connections' }
    }

    try {
      // Parse request body
      const buffers = []
      for await (const chunk of event.node.req) {
        buffers.push(chunk)
      }
      const data = Buffer.concat(buffers).toString()
      const body = JSON.parse(data)

      // Use latest transport
      const transport = activeTransports[activeTransports.length - 1]

      // Handle message
      const response = await transport.handleMessage(body)
      return response
    }
    catch (error) {
      event.node.res.statusCode = 500
      return { error: errorToMessage(error) }
    }
  }))

  // Register routes
  app.use(router)

  // Start server
  const listener = toNodeListener(app)
  await listen(listener, {
    showURL: true,
    port: 8080,
    open: true,
  })

  logger.main.log('🚀 Twitter MCP Dev Server started')

  // Handle exit
  process.on('SIGINT', async () => {
    logger.main.log('Shutting down server...')
    await browser.close()
    process.exit(0)
  })
}

// Execute
startDevServer().catch((error) => {
  logger.main.error('Failed to start dev server:', error)
  process.exit(1)
})
