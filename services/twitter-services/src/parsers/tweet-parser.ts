import type { ElementHandle, Page } from 'playwright'

import type { Tweet } from '../core/services/tweet'

import { logger } from '../utils/logger'
import { SELECTORS } from './selectors'

/**
 * Tweet Parser
 * Extracts tweet information directly from the page DOM using Playwright
 */
export class TweetParser {
  /**
   * Parse timeline tweets directly from the page
   * @param page Playwright page instance
   * @returns Promise resolving to Tweet array
   */
  static async parseTimelineTweets(page: Page): Promise<Tweet[]> {
    try {
      const tweetElements = await page.$$(SELECTORS.TIMELINE.TWEET)
      logger.parser.log(`Found ${tweetElements.length} tweet elements`)

      const tweets: Tweet[] = []

      for (const tweetElement of tweetElements) {
        const tweet = await this.extractTweetData(page, tweetElement)
        if (tweet) {
          tweets.push(tweet)
        }
      }

      return tweets
    }
    catch (error) {
      logger.parser.error('Error parsing timeline tweets:', (error as Error).message)
      return []
    }
  }

  /**
   * Extract tweet data from tweet element
   * @param page Playwright page instance
   * @param tweetElement Tweet element handle
   * @returns Promise resolving to Tweet object
   */
  static async extractTweetData(page: Page, tweetElement: ElementHandle): Promise<Tweet | null> {
    try {
      // Extract tweet ID
      const id = await this.extractTweetId(tweetElement)

      // Extract tweet text
      const textElement = await tweetElement.$(SELECTORS.TIMELINE.TWEET_TEXT)
      const text = textElement ? await textElement.textContent() : ''

      // Extract author info
      const author = await this.extractAuthorInfo(tweetElement)

      // Extract timestamp
      const timeElement = await tweetElement.$('time')
      const timestamp = timeElement ? await timeElement.getAttribute('datetime') : new Date().toISOString()

      // Extract engagement stats
      const stats = await this.extractTweetStats(tweetElement)

      // Extract media URLs
      const mediaUrls = await this.extractMediaUrls(tweetElement)

      const tweet: Tweet = {
        id,
        text: text || '',
        author,
        timestamp: timestamp || new Date().toISOString(),
        ...stats,
      }

      if (mediaUrls.length > 0) {
        tweet.mediaUrls = mediaUrls
      }

      return tweet
    }
    catch (error) {
      logger.parser.error('Error extracting tweet data:', (error as Error).message)
      return null
    }
  }

  /**
   * Extract tweet ID from tweet element
   * @param tweetElement Tweet element handle
   * @returns Promise resolving to tweet ID
   */
  private static async extractTweetId(tweetElement: ElementHandle): Promise<string> {
    try {
      // Try to get ID from status link
      const statusLink = await tweetElement.$('a[href*="/status/"]')
      if (statusLink) {
        const href = await statusLink.getAttribute('href')
        if (href) {
          const match = href.match(/\/status\/(\d+)/)
          if (match && match[1]) {
            return match[1]
          }
        }
      }

      // Fallback to a random ID
      return `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    }
    catch (error) {
      logger.parser.error('Error extracting tweet ID:', (error as Error).message)
      return `tweet-${Date.now()}`
    }
  }

  /**
   * Extract author info from tweet element
   * @param tweetElement Tweet element handle
   * @returns Promise resolving to author object
   */
  private static async extractAuthorInfo(tweetElement: ElementHandle): Promise<Tweet['author']> {
    try {
      // Find author element
      const authorElement = await tweetElement.$('[data-testid="User-Name"]')
      if (!authorElement) {
        return {
          username: 'unknown',
          displayName: 'Unknown User',
        }
      }

      // Get display name
      const displayNameElement = await authorElement.$('span:first-child')
      const displayName = displayNameElement ? await displayNameElement.textContent() || 'Unknown User' : 'Unknown User'

      // Get username
      const usernameElement = await authorElement.$('a[href^="/"]')
      let username = usernameElement ? await usernameElement.getAttribute('href') : 'unknown'
      username = username?.replace('/', '') || 'unknown'

      // Get avatar URL
      const avatarElement = await tweetElement.$('img[src*="/profile_images/"]')
      const avatarUrl = avatarElement ? await avatarElement.getAttribute('src') : undefined

      return {
        username,
        displayName,
        ...(avatarUrl && { avatarUrl }),
      }
    }
    catch (error) {
      logger.parser.error('Error extracting author info:', (error as Error).message)
      return {
        username: 'unknown',
        displayName: 'Unknown User',
      }
    }
  }

  /**
   * Extract tweet stats (likes, retweets, replies)
   * @param tweetElement Tweet element handle
   * @returns Promise resolving to stats object
   */
  private static async extractTweetStats(tweetElement: ElementHandle): Promise<{
    likeCount?: number
    retweetCount?: number
    replyCount?: number
  }> {
    const stats: {
      likeCount?: number
      retweetCount?: number
      replyCount?: number
    } = {}

    try {
      // Extract like count
      const likeElement = await tweetElement.$(SELECTORS.TIMELINE.LIKE_BUTTON)
      if (likeElement) {
        const likeCountElement = await likeElement.$('span span')
        const likeCountText = likeCountElement ? await likeCountElement.textContent() : null
        stats.likeCount = this.parseCount(likeCountText)
      }

      // Extract retweet count
      const retweetElement = await tweetElement.$(SELECTORS.TIMELINE.RETWEET_BUTTON)
      if (retweetElement) {
        const retweetCountElement = await retweetElement.$('span span')
        const retweetCountText = retweetCountElement ? await retweetCountElement.textContent() : null
        stats.retweetCount = this.parseCount(retweetCountText)
      }

      // Extract reply count
      const replyElement = await tweetElement.$(SELECTORS.TIMELINE.REPLY_BUTTON)
      if (replyElement) {
        const replyCountElement = await replyElement.$('span span')
        const replyCountText = replyCountElement ? await replyCountElement.textContent() : null
        stats.replyCount = this.parseCount(replyCountText)
      }

      return stats
    }
    catch (error) {
      logger.parser.error('Error extracting tweet stats:', (error as Error).message)
      return stats
    }
  }

  /**
   * Extract media URLs from tweet element
   * @param tweetElement Tweet element handle
   * @returns Promise resolving to array of media URLs
   */
  private static async extractMediaUrls(tweetElement: ElementHandle): Promise<string[]> {
    try {
      const mediaElements = await tweetElement.$$('img[src*="pbs.twimg.com/media/"]')

      const mediaUrls: string[] = []
      for (const mediaElement of mediaElements) {
        const src = await mediaElement.getAttribute('src')
        if (src) {
          mediaUrls.push(src)
        }
      }

      return mediaUrls
    }
    catch (error) {
      logger.parser.error('Error extracting media URLs:', (error as Error).message)
      return []
    }
  }

  /**
   * Parse count text (handles K, M suffixes)
   * @param countText Count text from tweet
   * @returns Parsed number or undefined
   */
  private static parseCount(countText: string | null): number | undefined {
    if (!countText)
      return undefined

    try {
      countText = countText.trim()
      if (!countText)
        return undefined

      if (countText.includes('K')) {
        return Math.round(Number.parseFloat(countText.replace('K', '')) * 1000)
      }
      else if (countText.includes('M')) {
        return Math.round(Number.parseFloat(countText.replace('M', '')) * 1000000)
      }

      return Number.parseInt(countText, 10) || undefined
    }
    catch {
      return undefined
    }
  }
}
