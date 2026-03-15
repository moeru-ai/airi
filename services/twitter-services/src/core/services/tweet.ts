import type { TwitterService } from '../../types/services'
import type { Context } from '../browser/context'

import { TWITTER_BASE_URL, TWITTER_HOME_URL, TWITTER_SEARCH_URL } from '../../constants'
import { SELECTORS } from '../../parsers/selectors'
import { TweetParser } from '../../parsers/tweet-parser'
import { scrollToLoadMoreTweets } from '../utils/scroll-helper'

/**
 * Tweet Interface
 */
export interface Tweet {
  id: string
  text: string
  author: {
    username: string
    displayName: string
    avatarUrl?: string
  }
  timestamp: string
  likeCount?: number
  retweetCount?: number
  replyCount?: number
  mediaUrls?: string[]
}

/**
 * Search Options
 */
export interface SearchOptions {
  count?: number
  filter?: 'latest' | 'photos' | 'videos' | 'top'
}

/**
 * Post Options
 */
export interface PostOptions {
  media?: string[]
  inReplyTo?: string
}

/**
 * Tweet Detail
 */
export interface TweetDetail extends Tweet {
  replies?: Tweet[]
  quotedTweet?: Tweet
}

export function useTwitterTweetServices(ctx: Context): TwitterService {
  /**
   * Searches for tweets based on the provided query and options
   */
  async function searchTweets(query: string, options: SearchOptions = {}): Promise<Tweet[]> {
    try {
      const page = ctx.page
      const searchUrl = new URL(TWITTER_SEARCH_URL)
      searchUrl.searchParams.append('q', query)

      if (options.filter) {
        searchUrl.searchParams.append('f', options.filter)
      }

      await page.goto(searchUrl.toString())
      await page.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // Apply filter if specified
      if (options.filter) {
        switch (options.filter) {
          case 'latest':
            await page.click(SELECTORS.SEARCH.LATEST_TAB)
            break
          case 'top':
            await page.click(SELECTORS.SEARCH.TOP_TAB)
            break
          case 'photos':
          case 'videos':
            // These require custom filter selection from the filter button
            await page.click(SELECTORS.SEARCH.SEARCH_FILTERS)
            await page.click(`[role="menuitem"]:has-text("${options.filter === 'photos' ? 'Photos' : 'Videos'}")`)
            break
        }
      }

      // Wait for content to load after filter change
      await page.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // Use the TweetParser to extract tweets
      let tweets = await TweetParser.parseTimelineTweets(page)

      // Limit tweets to count if specified
      if (options.count && options.count > 0) {
        tweets = tweets.slice(0, options.count)
      }

      return tweets
    }
    catch (error: unknown) {
      console.error('Error searching tweets:', error)
      throw new Error(`Failed to search tweets: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Likes a tweet with the given ID
   */
  async function likeTweet(tweetId: string): Promise<boolean> {
    try {
      const page = ctx.page
      await page.goto(`${TWITTER_BASE_URL}/i/status/${tweetId}`)
      await page.waitForSelector(SELECTORS.TIMELINE.TWEET)

      const likeButton = await page.$(SELECTORS.TIMELINE.LIKE_BUTTON)
      if (!likeButton) {
        throw new Error('Like button not found')
      }

      // Check if already liked
      const isAlreadyLiked = await page.$eval(
        SELECTORS.TIMELINE.LIKE_BUTTON,
        el => el.getAttribute('aria-pressed') === 'true',
      )

      if (!isAlreadyLiked) {
        await likeButton.click()
        // Wait for the like to register
        await page.waitForFunction(
          `document.querySelector('${SELECTORS.TIMELINE.LIKE_BUTTON}')?.getAttribute('aria-pressed') === 'true'`,
          { timeout: 5000 },
        )
      }

      return true
    }
    catch (error: unknown) {
      console.error('Error liking tweet:', error)
      throw new Error(`Failed to like tweet: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Retweets a tweet with the given ID
   */
  async function retweet(tweetId: string): Promise<boolean> {
    try {
      const page = ctx.page
      await page.goto(`${TWITTER_BASE_URL}/i/status/${tweetId}`)
      await page.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // Click retweet button to open modal
      const retweetButton = await page.$(SELECTORS.TIMELINE.RETWEET_BUTTON)
      if (!retweetButton) {
        throw new Error('Retweet button not found')
      }

      await retweetButton.click()

      // Wait for retweet confirmation dialog and click it
      await page.waitForSelector('[data-testid="retweetConfirm"]')
      await page.click('[data-testid="retweetConfirm"]')

      // Wait for the retweet to register
      await page.waitForFunction(
        `document.querySelector('${SELECTORS.TIMELINE.RETWEET_BUTTON}')?.getAttribute('aria-pressed') === 'true'`,
        { timeout: 5000 },
      )

      return true
    }
    catch (error: unknown) {
      console.error('Error retweeting:', error)
      throw new Error(`Failed to retweet: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Posts a new tweet with the given content and options
   */
  async function postTweet(content: string, options: PostOptions = {}): Promise<string> {
    try {
      const page = ctx.page
      // Go to home page where you can compose a tweet
      await page.goto(TWITTER_HOME_URL)

      // Wait for the tweet composer to load
      await page.waitForSelector(SELECTORS.COMPOSE.TWEET_INPUT)

      // Type the tweet content
      await page.click(SELECTORS.COMPOSE.TWEET_INPUT)
      await page.type(SELECTORS.COMPOSE.TWEET_INPUT, content)

      // Handle media uploads if any
      if (options.media && options.media.length > 0) {
        // Click the media button
        await page.click(SELECTORS.COMPOSE.MEDIA_BUTTON)

        // Wait for the file input and upload files
        await page.setInputFiles('input[type="file"][multiple]', options.media)

        // Wait for media to upload
        await page.waitForSelector('[data-testid="attachments"]')
      }

      // Handle reply case
      if (options.inReplyTo) {
        // For reply, we need to navigate to the tweet first and click reply
        await page.goto(`${TWITTER_BASE_URL}/i/status/${options.inReplyTo}`)
        await page.waitForSelector(SELECTORS.TIMELINE.REPLY_BUTTON)
        await page.click(SELECTORS.TIMELINE.REPLY_BUTTON)

        // Wait for reply composer and type content
        await page.waitForSelector(SELECTORS.COMPOSE.TWEET_INPUT)
        await page.click(SELECTORS.COMPOSE.TWEET_INPUT)
        await page.type(SELECTORS.COMPOSE.TWEET_INPUT, content)

        // If there's media, handle it
        if (options.media && options.media.length > 0) {
          await page.click(SELECTORS.COMPOSE.MEDIA_BUTTON)
          await page.setInputFiles('input[type="file"][multiple]', options.media)
          await page.waitForSelector('[data-testid="attachments"]')
        }
      }

      // Click the tweet button
      await page.click(SELECTORS.COMPOSE.TWEET_BUTTON)

      // Wait for the tweet to be posted
      await page.waitForSelector('[data-testid="toast"]', { timeout: 10000 })

      // Extract the tweet ID - we need to get the URL of the newly created tweet
      // Twitter usually redirects to the tweet page or shows a toast with a link
      let tweetId = ''

      try {
        // Try to find the link in the toast
        const toastLink = await page.$('[data-testid="toast"] a[href*="/status/"]')
        if (toastLink) {
          const href = await toastLink.getAttribute('href')
          if (href) {
            const match = href.match(/\/status\/(\d+)/)
            tweetId = match?.[1] || ''
          }
        }

        // If we couldn't get the ID from the toast, check the current URL
        if (!tweetId) {
          const url = await page.url()
          const match = url.match(/\/status\/(\d+)/)
          tweetId = match?.[1] || ''
        }
      }
      catch {
        // If we fail to get the ID, generate a temporary one
        tweetId = `temp-${Date.now()}`
      }

      return tweetId
    }
    catch (error: unknown) {
      console.error('Error posting tweet:', error)
      throw new Error(`Failed to post tweet: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Gets detailed information about a specific tweet
   */
  async function getTweetDetails(tweetId: string): Promise<TweetDetail> {
    try {
      const page = ctx.page
      await page.goto(`${TWITTER_BASE_URL}/i/status/${tweetId}`)
      await page.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // Get the main tweet element
      const tweetElement = await page.$(SELECTORS.TIMELINE.TWEET)
      if (!tweetElement) {
        throw new Error('Tweet element not found')
      }

      // Use the TweetParser to extract the main tweet data
      const mainTweet = await TweetParser.extractTweetData(page, tweetElement)
      if (!mainTweet) {
        throw new Error('Failed to extract tweet data')
      }

      // Check for quoted tweet
      let quotedTweet: Tweet | undefined
      const quotedTweetElement = await page.$('[data-testid="quotedTweet"]')
      if (quotedTweetElement) {
        const extractedQuotedTweet = await TweetParser.extractTweetData(page, quotedTweetElement)
        if (extractedQuotedTweet) {
          quotedTweet = extractedQuotedTweet
        }
      }

      // Get replies by scrolling to load more using reusable scroll logic
      const replySelector = '[data-testid="tweet"][aria-labelledby*="reply"]'

      // Try to load at least 10 replies (if available)
      await scrollToLoadMoreTweets(page, 10, replySelector)

      // Find reply tweets
      const replyElements = await page.$$(replySelector)

      const replies: Tweet[] = []
      for (const replyElement of replyElements) {
        const extractedReply = await TweetParser.extractTweetData(page, replyElement)
        if (extractedReply) {
          replies.push(extractedReply)
        }
      }

      // Construct the detailed tweet
      const tweetDetail: TweetDetail = {
        ...mainTweet,
        replies: replies.length > 0 ? replies : undefined,
        quotedTweet,
      }

      return tweetDetail
    }
    catch (error: unknown) {
      console.error('Error getting tweet details:', error)
      throw new Error(`Failed to get tweet details: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    searchTweets,
    likeTweet,
    retweet,
    postTweet,
    getTweetDetails,
  }
}
