import type { Page } from 'playwright'
import type { PostOptions, SearchOptions, TimelineOptions, Tweet, TweetDetail, UserProfile } from '../types/twitter'
import type { TwitterAuthService } from './auth-service'
import type { TwitterTimelineService } from './timeline-service'

import { logger } from '../utils/logger'

export class TwitterService {
  private authService: TwitterAuthService
  private timelineService: TwitterTimelineService
  private sessionMonitorInterval: NodeJS.Timeout | null = null
  private page: Page

  constructor(page: Page, authService: TwitterAuthService, timelineService: TwitterTimelineService) {
    this.authService = authService
    this.timelineService = timelineService
    this.page = page
  }

  /**
   * Login to Twitter
   * Attempts to restore session from saved cookies first
   * If that fails, will need manual login in the browser
   */
  async login(): Promise<boolean> {
    try {
      // Try to restore session from cookies
      const success = await this.authService.login()

      if (success) {
        logger.main.log('Successfully restored Twitter session from cookies')
        return true
      }

      logger.main.log('No saved session found, waiting for manual login')

      // Set up session monitoring to detect when user has manually logged in
      this.startSessionMonitor()

      return false
    }
    catch (error) {
      logger.main.error('Error during login:', (error as Error).message)
      return false
    }
  }

  /**
   * Get timeline
   */
  async getTimeline(options?: TimelineOptions): Promise<Tweet[]> {
    this.ensureAuthenticated()
    return this.timelineService.getTimeline(options)
  }

  /**
   * Get tweet details
   */
  async getTweetDetails(tweetId: string): Promise<TweetDetail> {
    this.ensureAuthenticated()
    // This is a stub implementation
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
   * Get user profile information for a Twitter user
   * @param username Twitter username to fetch profile for
   * @returns Promise resolving to user profile data
   */
  async getUserProfile(username: string): Promise<UserProfile> {
    this.ensureAuthenticated()

    try {
      // Navigate to user profile page
      await this.page.goto(`https://twitter.com/${username}`)

      // Wait for profile elements to load
      await this.page.waitForSelector('[data-testid="UserName"]')

      // Get display name
      const displayNameElement = await this.page.$('[data-testid="UserName"] div span')
      const displayName = displayNameElement ? await displayNameElement.textContent() || username : username

      // Get bio
      const bioElement = await this.page.$('[data-testid="UserDescription"]')
      const bio = bioElement ? await bioElement.textContent() : undefined

      // Get avatar URL
      const avatarElement = await this.page.$('img[src*="/profile_images/"]')
      const avatarUrl = avatarElement ? await avatarElement.getAttribute('src') : undefined

      // Get follower/following counts
      const followElement = await this.page.$('[href$="/followers"]')
      const followingElement = await this.page.$('[href$="/following"]')

      const followerCount = followElement
        ? Number.parseInt((await followElement.textContent() || '0').replace(/\D/g, ''))
        : undefined

      const followingCount = followingElement
        ? Number.parseInt((await followingElement.textContent() || '0').replace(/\D/g, ''))
        : undefined

      return {
        username,
        displayName,
        bio: bio || undefined,
        avatarUrl: avatarUrl || undefined,
        followersCount: followerCount || undefined,
        followingCount: followingCount || undefined,
      }
    }
    catch (error) {
      logger.main.error('Error fetching user profile:', (error as Error).message)
      throw new Error(`Failed to fetch profile for @${username}`)
    }
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
   * Post a tweet
   */
  async postTweet(_content: string, _options?: PostOptions): Promise<string> {
    throw new Error('Post tweet feature not yet implemented')
  }

  /**
   * Manually trigger a session save
   * Typically this is handled by the session monitor
   */
  async saveSession(): Promise<boolean> {
    try {
      if (!this.authService.isAuthenticated()) {
        logger.main.warn('Cannot save session when not authenticated')
        return false
      }

      await this.authService.saveCurrentSession()
      logger.main.log('Successfully saved Twitter session')
      return true
    }
    catch (error) {
      logger.main.error('Error saving session:', (error as Error).message)
      return false
    }
  }

  /**
   * Ensure the user is authenticated before performing operations
   * @private
   */
  private ensureAuthenticated(): void {
    if (!this.authService.isAuthenticated()) {
      throw new Error('You must be logged in to perform this action. Please call login() first.')
    }
  }

  /**
   * Export the current session cookies
   * @param format The format to export cookies in
   */
  async exportCookies(format: 'object' | 'string' = 'object'): Promise<Record<string, string> | string> {
    this.ensureAuthenticated()
    return this.authService.exportCookies(format)
  }

  /**
   * Start monitoring for session changes
   * This will periodically check if the user is logged in
   * and save the session if they are
   * @param interval Time in ms between checks
   */
  startSessionMonitor(interval: number = 30000): void {
    // Clear any existing monitor
    if (this.sessionMonitorInterval) {
      clearInterval(this.sessionMonitorInterval)
    }

    logger.main.log(`Starting Twitter session monitor with ${interval}ms interval`)

    this.sessionMonitorInterval = setInterval(async () => {
      try {
        await this.checkAndSaveSession()
      }
      catch (error) {
        logger.main.error('Error in session monitor:', (error as Error).message)
      }
    }, interval)
  }

  /**
   * Get the current page URL
   * Useful for debugging and checking the current state
   */
  async getCurrentUrl(): Promise<string> {
    try {
      return await this.authService.getCurrentUrl()
    }
    catch (error) {
      logger.main.error('Error getting current URL:', (error as Error).message)
      return 'unknown'
    }
  }

  /**
   * Stop the session monitor
   */
  stopSessionMonitor(): void {
    if (this.sessionMonitorInterval) {
      clearInterval(this.sessionMonitorInterval)
      this.sessionMonitorInterval = null
      logger.main.log('Stopped Twitter session monitor')
    }
  }

  /**
   * Check and save the session if logged in
   * @private
   */
  private async checkAndSaveSession(): Promise<void> {
    try {
      const isLoggedIn = await this.authService.checkLoginStatus()

      if (isLoggedIn && !this.authService.isAuthenticated()) {
        logger.main.log('User has logged in manually, saving session')
        await this.saveSession()
      }
      else if (!isLoggedIn && this.authService.isAuthenticated()) {
        logger.main.warn('User appears to be logged out, updating state')
      }
    }
    catch (error) {
      logger.main.error('Error checking session status:', (error as Error).message)
    }
  }
}
