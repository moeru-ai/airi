import type { TimelineOptions, TwitterCredentials, TwitterService } from '../types/twitter'

import { Client } from '@proj-airi/server-sdk'

import { logger } from '../utils/logger'

/**
 * Airi 适配器
 * 将 Twitter 服务适配为 Airi 模块
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
        // 定义此模块可以处理的事件类型
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
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 登录处理
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

    // 获取时间线处理
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

    // 其他事件处理...
  }

  /**
   * 启动适配器
   */
  async start(): Promise<void> {
    // 可以在这里添加初始化逻辑
    logger.airi.log('Airi Twitter adapter started')
  }
}
