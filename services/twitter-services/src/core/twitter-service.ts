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
 * Twitter service implementation
 * Integrates various service components, providing a unified interface
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
   * Log in to Twitter
   */
  async login(credentials: TwitterCredentials): Promise<boolean> {
    return await this.authService.login(credentials)
  }

  /**
   * Get timeline
   */
  async getTimeline(options?: TimelineOptions): Promise<Tweet[]> {
    this.ensureAuthenticated()
    return await this.timelineService.getTimeline(options)
  }

  /**
   * Get tweet details (not implemented in MVP)
   */
  async getTweetDetails(tweetId: string): Promise<TweetDetail> {
    this.ensureAuthenticated()
    // In MVP stage, return a basic structure
    return {
      id: tweetId,
      text: 'Tweet details feature not yet implemented',
      author: {
        username: 'twitter',
        displayName: 'Twitter',
      },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Search tweets
   */
  async searchTweets(_query: string, _options?: SearchOptions): Promise<Tweet[]> {
    throw new Error('Search feature not yet implemented')
  }

  /**
   * Get user profile
   */
  async getUserProfile(_username: string): Promise<UserProfile> {
    throw new Error('Get user profile feature not yet implemented')
  }

  /**
   * Follow user (not implemented in MVP)
   */
  async followUser(_username: string): Promise<boolean> {
    this.ensureAuthenticated()
    return false
  }

  /**
   * Like tweet
   */
  async likeTweet(_tweetId: string): Promise<boolean> {
    throw new Error('Like feature not yet implemented')
  }

  /**
   * Retweet
   */
  async retweet(_tweetId: string): Promise<boolean> {
    throw new Error('Retweet feature not yet implemented')
  }

  /**
   * Post tweet
   */
  async postTweet(_content: string, _options?: PostOptions): Promise<string> {
    throw new Error('Post tweet feature not yet implemented')
  }

  /**
   * Ensure authenticated
   */
  private ensureAuthenticated(): void {
    if (!this.authService.isAuthenticated()) {
      throw new Error('Not authenticated. Call login() first.')
    }
  }
}
