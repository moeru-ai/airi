import type { BrowserAdapter } from '../adapters/browser-adapter'
import type { TimelineOptions, Tweet } from '../types/twitter'

import { TweetParser } from '../parsers/tweet-parser'
import { RateLimiter } from '../utils/rate-limiter'
import { SELECTORS } from '../utils/selectors'

/**
 * Twitter Timeline Service
 * Handles fetching and parsing timeline content
 */
export class TwitterTimelineService {
  private browser: BrowserAdapter
  private rateLimiter: RateLimiter

  constructor(browser: BrowserAdapter) {
    this.browser = browser
    this.rateLimiter = new RateLimiter(10, 60000) // 10 requests per minute
  }

  /**
   * Get timeline
   */
  async getTimeline(options: TimelineOptions = {}): Promise<Tweet[]> {
    // Wait for rate limit
    await this.rateLimiter.waitUntilReady()

    try {
      // Navigate to home page
      await this.browser.navigate('https://twitter.com/home')

      // Wait for timeline to load
      await this.browser.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // Delay a bit to ensure content is fully loaded
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Get page HTML content
      const html = await this.browser.executeScript<string>('document.documentElement.outerHTML')

      // Parse tweets
      const tweets = TweetParser.parseTimelineTweets(html)

      // Apply filtering and limits
      let filteredTweets = tweets

      if (options.includeReplies === false) {
        filteredTweets = filteredTweets.filter(tweet => !tweet.id.includes('reply'))
      }

      if (options.includeRetweets === false) {
        filteredTweets = filteredTweets.filter(tweet => !tweet.id.includes('retweet'))
      }

      if (options.count) {
        filteredTweets = filteredTweets.slice(0, options.count)
      }

      return filteredTweets
    }
    catch (error) {
      console.error('Failed to get timeline:', error)
      return []
    }
  }
}
