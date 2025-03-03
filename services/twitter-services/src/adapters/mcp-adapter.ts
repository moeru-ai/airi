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
 * MCP 协议适配器
 * 使用官方 MCP SDK 将 Twitter 服务适配为 MCP 协议服务
 * 基于 H3.js 实现 HTTP 服务器
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

    // 创建 MCP 服务器
    this.mcpServer = new McpServer({
      name: 'Twitter Service',
      version: '1.0.0',
    })

    // 创建 H3 应用
    this.app = createApp()

    // 配置资源和工具
    this.configureServer()

    // 设置 H3 路由
    this.setupRoutes()
  }

  /**
   * 配置 MCP 服务器的资源和工具
   */
  private configureServer(): void {
    // 添加时间线资源
    this.mcpServer.resource(
      'timeline',
      new ResourceTemplate('twitter://timeline/{count}', { list: async () => ({
        resources: [{
          name: 'timeline',
          uri: 'twitter://timeline',
          description: '推文时间线',
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
          logger.mcp.errorWithError('获取时间线错误:', error)
          return { contents: [] }
        }
      },
    )

    // 添加推文详情资源
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
          logger.mcp.errorWithError('获取推文详情错误:', error)
          return { contents: [] }
        }
      },
    )

    // 添加用户资料资源
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
          logger.mcp.errorWithError('获取用户资料错误:', error)
          return { contents: [] }
        }
      },
    )

    // 添加登录工具
    this.mcpServer.tool(
      'login',
      {
        username: z.string(),
        password: z.string(),
      },
      async ({ username, password }) => {
        try {
          const success = await this.twitterService.login({ username, password })

          return {
            content: [{
              type: 'text',
              text: success ? '成功登录到 Twitter' : '登录失败，请检查凭据',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `登录失败: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // 添加发推工具
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
              text: `成功发布推文: ${tweetId}`,
            }],
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

    // 添加点赞工具
    this.mcpServer.tool(
      'like-tweet',
      { tweetId: z.string() },
      async ({ tweetId }) => {
        try {
          const success = await this.twitterService.likeTweet(tweetId)

          return {
            content: [{
              type: 'text',
              text: success ? '成功点赞' : '点赞失败',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `点赞失败: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // 添加转发工具
    this.mcpServer.tool(
      'retweet',
      { tweetId: z.string() },
      async ({ tweetId }) => {
        try {
          const success = await this.twitterService.retweet(tweetId)

          return {
            content: [{
              type: 'text',
              text: success ? '成功转发' : '转发失败',
            }],
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `转发失败: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )

    // 添加搜索工具
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
              text: `搜索结果: ${results.length} 条推文`,
            }],
            resources: results.map(tweet => `twitter://tweet/${tweet.id}`),
          }
        }
        catch (error) {
          return {
            content: [{ type: 'text', text: `搜索失败: ${errorToMessage(error)}` }],
            isError: true,
          }
        }
      },
    )
  }

  /**
   * 设置 H3 路由
   */
  private setupRoutes(): void {
    const router = createRouter()

    // 设置 CORS
    router.use('*', defineEventHandler((event) => {
      event.node.res.setHeader('Access-Control-Allow-Origin', '*')
      event.node.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      event.node.res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (event.node.req.method === 'OPTIONS') {
        event.node.res.statusCode = 204
        event.node.res.end()
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
      this.activeTransports.push(transport)

      // 客户端断开连接时清理
      req.on('close', () => {
        const index = this.activeTransports.indexOf(transport)
        if (index !== -1) {
          this.activeTransports.splice(index, 1)
        }
      })

      // 连接到 MCP 服务器
      await this.mcpServer.connect(transport)
    }))

    // 消息端点，接收客户端请求
    router.post('/messages', defineEventHandler(async (event) => {
      if (this.activeTransports.length === 0) {
        event.node.res.statusCode = 503
        return { error: 'No active SSE connections' }
      }

      try {
        // 解析请求体
        const body = await readBody(event)

        // 简单处理 - 发送到最近的传输
        // 注意: 生产环境中应该使用会话ID来路由到正确的传输
        const transport = this.activeTransports[this.activeTransports.length - 1]

        // 手动处理 POST 消息，因为 H3 不是 Express 兼容的
        const response = await transport.handleMessage(body)

        return response
      }
      catch (error) {
        event.node.res.statusCode = 500
        return { error: errorToMessage(error) }
      }
    }))

    // 根路径 - 提供服务信息
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

    // 使用路由
    this.app.use(router)
  }

  /**
   * 启动 MCP 服务器
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      // 创建 Node.js HTTP 服务器
      this.server = createServer(toNodeListener(this.app))

      this.server.listen(this.port, () => {
        logger.mcp.withField('port', this.port).log('MCP 服务器已启动')
        resolve()
      })
    })
  }

  /**
   * 停止 MCP 服务器
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
          logger.mcp.log('MCP 服务器已停止')
          resolve()
        }
      })
    })
  }
}

// h3 工具函数：从 event 读取请求体
async function readBody(event: any): Promise<any> {
  const buffers = []
  for await (const chunk of event.node.req) {
    buffers.push(chunk)
  }
  const data = Buffer.concat(buffers).toString()
  return JSON.parse(data)
}
