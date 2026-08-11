import type { TwitterService } from '../../types/services'
import type { Context } from '../browser/context'
import type { Tweet } from './tweet'

import { TWITTER_HOME_URL } from '../../constants'
import { SELECTORS } from '../../parsers/selectors'
import { TweetParser } from '../../parsers/tweet-parser'
import { logger } from '../../utils/logger'
import { scrollToLoadMoreTweets } from '../utils/scroll-helper'

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
        await scrollToLoadMoreTweets(ctx.page, Math.min(options.count, 20))
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

  return {
    getTimeline,
  }
}
