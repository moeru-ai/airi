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
   * Fetches the Twitter timeline
   * @param options Configuration options for timeline fetching
   * @returns Promise resolving to an array of tweets
   */
  async getTimeline(options: TimelineOptions = {}): Promise<Tweet[]> {
    try {
      logger.timeline.withFields({ options }).log('Fetching timeline')

      // Navigate to home page
      await this.page.goto('https://x.com/home')

      // Wait for timeline to load
      await this.page.waitForSelector(SELECTORS.TIMELINE.TWEET, { timeout: 10000 })

      // Optional: scroll to load more tweets if needed
      if (options.count && options.count > 5) {
        await this.scrollToLoadMoreTweets(Math.min(options.count, 20))
      }

      // Parse all tweets directly from the DOM using Playwright
      const tweets = await TweetParser.parseTimelineTweets(this.page)

      logger.timeline.log(`Found ${tweets.length} tweets in timeline`)

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
      logger.timeline.error('Failed to get timeline:', (error as Error).message)
      return []
    }
  }

  /**
   * Scrolls down the timeline to load more tweets
   * @param targetCount Approximate number of tweets to load
   */
  private async scrollToLoadMoreTweets(targetCount: number): Promise<void> {
    try {
      // Initial tweet count
      let previousTweetCount = 0
      let currentTweetCount = await this.countVisibleTweets()
      let scrollAttempts = 0
      const maxScrollAttempts = 10

      logger.timeline.log(`Initial tweet count: ${currentTweetCount}, target: ${targetCount}`)

      // Scroll until we have enough tweets or reach maximum scroll attempts
      while (currentTweetCount < targetCount && scrollAttempts < maxScrollAttempts) {
        // Scroll down using Playwright's mouse wheel simulation
        await this.page.mouse.wheel(0, 800)

        // Wait for new content to load
        await this.page.waitForTimeout(1000)

        // Check if we have new tweets
        previousTweetCount = currentTweetCount
        currentTweetCount = await this.countVisibleTweets()

        // If no new tweets were loaded, we might have reached the end
        if (currentTweetCount === previousTweetCount) {
          scrollAttempts++
        }
        else {
          scrollAttempts = 0 // Reset counter if we're still loading tweets
        }

        logger.timeline.debug(`Scrolled for more tweets: ${currentTweetCount}/${targetCount}`)
      }
    }
    catch (error) {
      logger.timeline.error('Error while scrolling for more tweets:', (error as Error).message)
    }
  }

  /**
   * Counts the number of visible tweets on the page
   * @returns Promise resolving to the count of visible tweets
   */
  private async countVisibleTweets(): Promise<number> {
    const tweetElements = await this.page.$$(SELECTORS.TIMELINE.TWEET)
    return tweetElements.length
  }
}
