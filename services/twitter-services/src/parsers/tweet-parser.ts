import type { Element } from 'hast'
import type { Tweet } from '../types/twitter'

import { SELECTORS } from '../utils/selectors'
import { HtmlParser } from './html-parser'

/**
 * Tweet Parser
 * Extracts tweet information from HTML
 */
export class TweetParser {
  /**
   * Parse timeline tweets from HTML
   * @param html HTML string
   * @returns Tweet array
   */
  static parseTimelineTweets(html: string): Tweet[] {
    const tree = HtmlParser.parse(html)
    const tweetElements = HtmlParser.select(tree, SELECTORS.TIMELINE.TWEET)

    return tweetElements.map(el => this.extractTweetData(el))
  }

  /**
   * Extract tweet data from tweet element
   * @param element Tweet element
   * @returns Tweet data
   */
  static extractTweetData(element: Element): Tweet {
    // Get tweet ID
    const id = this.extractTweetId(element)

    // Get tweet text
    const textElement = HtmlParser.select(element, SELECTORS.TIMELINE.TWEET_TEXT)[0]
    const text = this.extractTextContent(textElement)

    // Get author info
    const author = this.extractAuthorInfo(element)

    // Get timestamp
    const timeElement = HtmlParser.select(element, SELECTORS.TIMELINE.TWEET_TIME)[0]
    const timestamp = timeElement?.properties?.datetime as string || new Date().toISOString()

    // Get stats
    const stats = this.extractTweetStats(element)

    return {
      id,
      text,
      author,
      timestamp,
      ...stats,
    }
  }

  /**
   * Extract tweet ID
   */
  private static extractTweetId(element: Element): string {
    // Extract ID from data-tweet-id attribute or other location
    return element.properties?.['data-tweet-id'] as string
      || `tweet-${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * Extract text content
   */
  private static extractTextContent(element?: Element): string {
    if (!element)
      return ''

    let text = ''
    HtmlParser.visit(element, 'text', (node) => {
      text += node.value
    })

    return text.trim()
  }

  /**
   * Extract author info
   */
  private static extractAuthorInfo(_element: Element) {
    // Extract author name, username and avatar
    // This part needs to be adjusted based on the actual DOM structure of Twitter
    return {
      username: 'username', // Placeholder, actual implementation needs to be based on DOM structure
      displayName: 'displayName',
      avatarUrl: undefined,
    }
  }

  /**
   * Extract tweet stats
   */
  private static extractTweetStats(_element: Element) {
    // Extract like count, retweet count and reply count
    return {
      likeCount: undefined,
      retweetCount: undefined,
      replyCount: undefined,
    }
  }
}
