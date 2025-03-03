import type { Element } from 'hast'
import type { Tweet } from '../types/twitter'

import { SELECTORS } from '../utils/selectors'
import { HtmlParser } from './html-parser'

/**
 * 推文解析器
 * 从 HTML 中提取推文信息
 */
export class TweetParser {
  /**
   * 从 HTML 中解析推文列表
   * @param html HTML 字符串
   * @returns 推文数组
   */
  static parseTimelineTweets(html: string): Tweet[] {
    const tree = HtmlParser.parse(html)
    const tweetElements = HtmlParser.select(tree, SELECTORS.TIMELINE.TWEET)

    return tweetElements.map(el => this.extractTweetData(el))
  }

  /**
   * 从推文元素中提取推文数据
   * @param element 推文元素
   * @returns 推文数据
   */
  static extractTweetData(element: Element): Tweet {
    // 获取推文 ID
    const id = this.extractTweetId(element)

    // 获取推文文本
    const textElement = HtmlParser.select(element, SELECTORS.TIMELINE.TWEET_TEXT)[0]
    const text = this.extractTextContent(textElement)

    // 获取作者信息
    const author = this.extractAuthorInfo(element)

    // 获取时间戳
    const timeElement = HtmlParser.select(element, SELECTORS.TIMELINE.TWEET_TIME)[0]
    const timestamp = timeElement?.properties?.datetime as string || new Date().toISOString()

    // 获取统计数据
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
   * 提取推文ID
   */
  private static extractTweetId(element: Element): string {
    // 从 data-tweet-id 属性或其他位置提取ID
    return element.properties?.['data-tweet-id'] as string
      || `tweet-${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * 提取文本内容
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
   * 提取作者信息
   */
  private static extractAuthorInfo(_element: Element) {
    // 根据选择器提取作者名称、用户名和头像
    // 这部分需要根据Twitter的实际DOM结构调整
    return {
      username: '用户名', // 占位，实际实现需要根据DOM结构
      displayName: '显示名称',
      avatarUrl: undefined,
    }
  }

  /**
   * 提取推文统计信息
   */
  private static extractTweetStats(_element: Element) {
    // 提取点赞数、转发数和评论数
    return {
      likeCount: undefined,
      retweetCount: undefined,
      replyCount: undefined,
    }
  }
}
