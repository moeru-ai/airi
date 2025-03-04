import type {
  TwitterService as ITwitterService,
  PostOptions,
  SearchOptions,
  TimelineOptions,
  Tweet,
  TweetDetail,
  UserProfile,
} from '../types/twitter'
import type { TwitterAuthService } from './auth-service'
import type { TwitterTimelineService } from './timeline-service'

import process from 'node:process'

/**
 * Twitter service implementation
 * Integrates various service components, providing a unified interface
 */
export class TwitterService implements ITwitterService {
  private authService: TwitterAuthService
  private timelineService: TwitterTimelineService

  constructor(authService: TwitterAuthService, timelineService: TwitterTimelineService) {
    this.authService = authService
    this.timelineService = timelineService
  }

  /**
   * Log in to Twitter
   */
  async login(): Promise<boolean> {
    return await this.authService.login()
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
   * Save current browser session to file
   * This allows users to manually save their session after logging in
   */
  async saveSession(): Promise<boolean> {
    try {
      await this.authService.saveCurrentSession()
      return true
    }
    catch {
      return false
    }
  }

  /**
   * Ensure authenticated
   */
  private ensureAuthenticated(): void {
    if (!this.authService.isAuthenticated()) {
      throw new Error('Not authenticated. Call login() first.')
    }
  }

  /**
   * Export current session cookies
   * @param format - The format of the returned cookies ('object' or 'string')
   */
  async exportCookies(format: 'object' | 'string' = 'object'): Promise<Record<string, string> | string> {
    return await this.authService.exportCookies(format)
  }

  /**
   * Start automatic session monitoring
   * Checks login status at regular intervals and saves the session if login is detected
   * @param interval Interval in milliseconds, defaults to 30 seconds
   */
  startSessionMonitor(interval: number = 30000): void {
    // Check immediately in case we're already logged in
    this.checkAndSaveSession()

    // Set interval for regular checks
    const timer = setInterval(() => {
      this.checkAndSaveSession()
    }, interval)

    // Clean up timer on process exit
    process.on('exit', () => {
      clearInterval(timer)
    })

    process.on('SIGINT', () => {
      clearInterval(timer)
    })

    process.on('SIGTERM', () => {
      clearInterval(timer)
    })
  }

  /**
   * Get current page URL
   * @returns Current URL of the Twitter page
   */
  async getCurrentUrl(): Promise<string> {
    try {
      // We need to access the page from one of our services
      // AuthService has direct access to the page object
      const currentUrl = await this.authService.getCurrentUrl()
      return currentUrl
    }
    catch (error) {
      throw new Error(`Failed to get current URL: ${error}`)
    }
  }

  /**
   * Check login status and save session if logged in
   * @private
   */
  private async checkAndSaveSession(): Promise<void> {
    try {
      const isLoggedIn = this.authService.isAuthenticated() || await this.authService.checkLoginStatus()
      if (isLoggedIn) {
        await this.saveSession()
      }
    }
    catch {
      // Silently handle errors - don't disrupt the application flow
    }
  }
}
