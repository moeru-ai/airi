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

// 加载环境变量
dotenv.config()

/**
 * 开发服务器入口点
 * 使用 listhen 提供开发时的便利功能
 */
async function startDevServer() {
  const app = createApp()
  const router = createRouter()

  // 创建浏览器和 Twitter 服务
  const browser = new StagehandBrowserAdapter(process.env.BROWSERBASE_API_KEY || '')
  await browser.initialize({
    headless: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })

  const twitter = new TwitterService(browser)

  // 可选: 如果有凭据，进行登录
  if (process.env.TWITTER_USERNAME && process.env.TWITTER_PASSWORD) {
    const success = await twitter.login({
      username: process.env.TWITTER_USERNAME,
      password: process.env.TWITTER_PASSWORD,
    })

    if (success) {
      logger.main.log('✅ 已成功登录 Twitter')
    }
    else {
      logger.main.warn('⚠️ Twitter 登录失败')
    }
  }

  // 创建 MCP 服务器
  const mcpServer = new McpServer({
    name: 'Twitter Service (Dev)',
    version: '1.0.0-dev',
  })

  // 配置 MCP 资源
  mcpServer.resource(
    'timeline',
    new ResourceTemplate('twitter://timeline/{count}', { list: async () => ({
      resources: [{
        name: 'twitter-timeline',
        uri: 'twitter://timeline',
        description: '推文时间线',
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
        logger.mcp.errorWithError('获取时间线错误:', error)
        return { contents: [] }
      }
    },
  )

  // 配置一些基本工具
  mcpServer.tool(
    'post-tweet',
    {
      content: z.string(),
    },
    async ({ content }: { content: string }) => {
      try {
        const tweetId = await twitter.postTweet(content)
        return {
          content: [{ type: 'text', text: `成功发布推文: ${tweetId}` }],
        }
      }
      catch (error) {
        return {
          content: [{ type: 'text', text: `发推失败: ${errorToMessage(error)}` }],
          isError: true,
        }
      }
    },
  )

  // 保存活跃的 SSE 传输
  const activeTransports: SSEServerTransport[] = []

  // 设置路由
  router.get('/', defineEventHandler(() => {
    return {
      name: 'Twitter MCP 开发服务',
      version: '1.0.0-dev',
      status: 'running',
      endpoints: {
        sse: '/sse',
        messages: '/messages',
      },
    }
  }))

  // SSE 端点
  router.get('/sse', defineEventHandler(async (event) => {
    const { req, res } = event.node

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 创建 SSE 传输
    const transport = new SSEServerTransport('/messages', res)
    activeTransports.push(transport)

    // 客户端断开连接时清理
    req.on('close', () => {
      const index = activeTransports.indexOf(transport)
      if (index !== -1) {
        activeTransports.splice(index, 1)
      }
    })

    // 连接到 MCP 服务器
    await mcpServer.connect(transport)
  }))

  // 消息端点
  router.post('/messages', defineEventHandler(async (event) => {
    if (activeTransports.length === 0) {
      event.node.res.statusCode = 503
      return { error: 'No active SSE connections' }
    }

    try {
      // 解析请求体
      const buffers = []
      for await (const chunk of event.node.req) {
        buffers.push(chunk)
      }
      const data = Buffer.concat(buffers).toString()
      const body = JSON.parse(data)

      // 使用最近的传输
      const transport = activeTransports[activeTransports.length - 1]

      // 处理消息
      const response = await transport.handleMessage(body)
      return response
    }
    catch (error) {
      event.node.res.statusCode = 500
      return { error: errorToMessage(error) }
    }
  }))

  // 注册路由
  app.use(router)

  // 启动服务器
  const listener = toNodeListener(app)
  await listen(listener, {
    showURL: true,
    port: 8080,
    open: true,
  })

  logger.main.log('🚀 Twitter MCP 开发服务器已启动')

  // 处理退出
  process.on('SIGINT', async () => {
    logger.main.log('正在关闭服务器...')
    await browser.close()
    process.exit(0)
  })
}

// 执行
startDevServer().catch((error) => {
  logger.main.error('启动开发服务器失败:', error)
  process.exit(1)
})
