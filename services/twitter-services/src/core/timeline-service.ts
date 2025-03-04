import type { Page } from 'playwright'
import type { TimelineOptions, Tweet } from '../types/twitter'

import { TweetParser } from '../parsers/tweet-parser'
import { logger } from '../utils/logger'
import { SELECTORS } from '../utils/selectors'

/**
 * Twitter Timeline Service
 * Handles fetching and parsing timeline content
 */
export class TwitterTimelineService {
  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Get timeline
   */
  async getTimeline(options: TimelineOptions = {}): Promise<Tweet[]> {
    try {
      // Navigate to home page
      await this.page.goto('https://x.com/home')

      // Wait for timeline to load
      await this.page.waitForSelector(SELECTORS.TIMELINE.TWEET, { timeout: 10000 })

      // Get page HTML and parse all tweets
      const html = await this.page.content()
      const tweets = TweetParser.parseTimelineTweets(html)

      logger.main.log(`Found ${tweets.length} tweets in timeline`)

      // Apply filters
      let filteredTweets = tweets

      if (options.includeReplies === false) {
        filteredTweets = filteredTweets.filter(tweet => !tweet.text.startsWith('@'))
      }

      if (options.includeRetweets === false) {
        filteredTweets = filteredTweets.filter(tweet => !tweet.text.startsWith('RT @'))
      }

      // Apply count limit if specified
      if (options.count) {
        filteredTweets = filteredTweets.slice(0, options.count)
      }

      return filteredTweets
    }
    catch (error) {
      logger.main.withError(error as Error).error('Failed to get timeline')
      return []
    }
  }
}
