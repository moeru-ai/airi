import type { TwitterService } from '../../types/services'
import type { Context } from '../browser/context'
import type { Tweet } from './tweet'

import { TWITTER_HOME_URL } from '../../../constants'
import { TweetParser } from '../../parsers/tweet-parser'
import { logger } from '../../utils/logger'
import { SELECTORS } from '../../utils/selectors'

/**
 * Timeline Options
 */
export interface TimelineOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
  limit?: number
}

export function useTwitterTimelineServices(ctx: Context): TwitterService {
  async function getTimeline(options: TimelineOptions = {}): Promise<Tweet[]> {
    try {
      logger.timeline.withFields({ options }).log('Fetching timeline')

      // Navigate to home page
      await ctx.page.goto(TWITTER_HOME_URL)

      // Wait for timeline to load
      await ctx.page.waitForSelector(SELECTORS.TIMELINE.TWEET, { timeout: 10000 })

      // Optional: scroll to load more tweets if needed
      if (options.count && options.count > 5) {
        await scrollToLoadMoreTweets(Math.min(options.count, 20))
      }

      // Parse all tweets directly from the DOM using Playwright
      const tweets = await TweetParser.parseTimelineTweets(ctx.page)

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

  async function scrollToLoadMoreTweets(targetCount: number): Promise<void> {
    try {
    // Initial tweet count
      let previousTweetCount = 0
      let currentTweetCount = await countVisibleTweets()
      let scrollAttempts = 0
      const maxScrollAttempts = 10

      logger.timeline.log(`Initial tweet count: ${currentTweetCount}, target: ${targetCount}`)

      // Scroll until we have enough tweets or reach maximum scroll attempts
      while (currentTweetCount < targetCount && scrollAttempts < maxScrollAttempts) {
      // Scroll down using Playwright's mouse wheel simulation
        await ctx.page.mouse.wheel(0, 800)

        // Wait for new content to load
        await ctx.page.waitForTimeout(1000)

        // Check if we have new tweets
        previousTweetCount = currentTweetCount
        currentTweetCount = await countVisibleTweets()

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

  async function countVisibleTweets(): Promise<number> {
    const tweetElements = await ctx.page.$$(SELECTORS.TIMELINE.TWEET)
    return tweetElements.length
  }

  return {
    getTimeline,
  }
}
