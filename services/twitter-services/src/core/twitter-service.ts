import type { BrowserAdapter } from '../adapters/browser-adapter'
import type {
  TwitterService as ITwitterService,
  PostOptions,
  SearchOptions,
  TimelineOptions,
  Tweet,
  TweetDetail,
  TwitterCredentials,
  UserProfile,
} from '../types/twitter'

import { TwitterAuthService } from './auth-service'
import { TwitterTimelineService } from './timeline-service'

/**
 * Twitter 服务实现
 * 集成各个服务组件，提供统一的接口
 */
export class TwitterService implements ITwitterService {
  private browser: BrowserAdapter
  private authService: TwitterAuthService
  private timelineService: TwitterTimelineService

  constructor(browser: BrowserAdapter) {
    this.browser = browser
    this.authService = new TwitterAuthService(browser)
    this.timelineService = new TwitterTimelineService(browser)
  }

  /**
   * 登录 Twitter
   */
  async login(credentials: TwitterCredentials): Promise<boolean> {
    return await this.authService.login(credentials)
  }

  /**
   * 获取时间线
   */
  async getTimeline(options?: TimelineOptions): Promise<Tweet[]> {
    this.ensureAuthenticated()
    return await this.timelineService.getTimeline(options)
  }

  /**
   * 获取推文详情（MVP暂未实现）
   */
  async getTweetDetails(tweetId: string): Promise<TweetDetail> {
    this.ensureAuthenticated()
    // MVP阶段，返回一个基本结构
    return {
      id: tweetId,
      text: '推文详情功能尚未实现',
      author: {
        username: 'twitter',
        displayName: 'Twitter',
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * 搜索推文
   */
  async search(_query: string, _options?: SearchOptions): Promise<Tweet[]> {
    throw new Error('搜索功能尚未实现')
  }

  /**
   * 获取用户资料
   */
  async getUserProfile(_username: string): Promise<UserProfile> {
    throw new Error('获取用户资料功能尚未实现')
  }

  /**
   * 关注用户（MVP暂未实现）
   */
  async followUser(_username: string): Promise<boolean> {
    this.ensureAuthenticated()
    return false
  }

  /**
   * 点赞推文
   */
  async likeTweet(_tweetId: string): Promise<boolean> {
    throw new Error('点赞功能尚未实现')
  }

  /**
   * 转发推文
   */
  async retweet(_tweetId: string): Promise<boolean> {
    throw new Error('转发功能尚未实现')
  }

  /**
   * 发送推文
   */
  async postTweet(_content: string, _options?: PostOptions): Promise<string> {
    throw new Error('发送推文功能尚未实现')
  }

  /**
   * 确保已经登录
   */
  private ensureAuthenticated(): void {
    if (!this.authService.isAuthenticated()) {
      throw new Error('Not authenticated. Call login() first.')
    }
  }
}
