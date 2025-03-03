import type { BrowserAdapter } from '../adapters/browser-adapter'
import type { TimelineOptions, Tweet } from '../types/twitter'

import { TweetParser } from '../parsers/tweet-parser'
import { RateLimiter } from '../utils/rate-limiter'
import { SELECTORS } from '../utils/selectors'

/**
 * Twitter 时间线服务
 * 处理获取和解析时间线内容
 */
export class TwitterTimelineService {
  private browser: BrowserAdapter
  private rateLimiter: RateLimiter

  constructor(browser: BrowserAdapter) {
    this.browser = browser
    this.rateLimiter = new RateLimiter(10, 60000) // 每分钟10个请求
  }

  /**
   * 获取时间线
   */
  async getTimeline(options: TimelineOptions = {}): Promise<Tweet[]> {
    // 等待频率限制
    await this.rateLimiter.waitUntilReady()

    try {
      // 导航到主页
      await this.browser.navigate('https://twitter.com/home')

      // 等待时间线加载
      await this.browser.waitForSelector(SELECTORS.TIMELINE.TWEET)

      // 延迟一下，确保内容加载完成
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 获取页面HTML内容
      const html = await this.browser.executeScript<string>('document.documentElement.outerHTML')

      // 解析推文
      const tweets = TweetParser.parseTimelineTweets(html)

      // 应用筛选和限制
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
