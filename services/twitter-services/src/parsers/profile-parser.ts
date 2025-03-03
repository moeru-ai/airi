import type { Element, Root } from 'hast'
import type { UserProfile } from '../types/twitter'

import { SELECTORS } from '../utils/selectors'
import { HtmlParser } from './html-parser'

/**
 * 用户资料解析器
 * 从 HTML 中提取用户资料信息
 */
export class ProfileParser {
  /**
   * 从 HTML 中解析用户资料
   * @param html HTML 字符串
   * @returns 用户资料
   */
  static parseUserProfile(html: string): UserProfile {
    const tree = HtmlParser.parse(html)

    // 提取用户名和显示名称
    const displayNameElement = HtmlParser.select(tree, SELECTORS.PROFILE.DISPLAY_NAME)[0]
    const displayName = this.extractTextContent(displayNameElement) || 'Unknown User'

    // 从URL或DOM中提取用户名
    const username = this.extractUsername(tree) || 'unknown'

    // 提取用户简介
    const bioElement = HtmlParser.select(tree, SELECTORS.PROFILE.BIO)[0]
    const bio = this.extractTextContent(bioElement)

    // 提取用户统计数据
    const stats = this.extractProfileStats(tree)

    // 提取头像和背景图
    const avatarUrl = this.extractAvatarUrl(tree)
    const bannerUrl = this.extractBannerUrl(tree)

    return {
      username,
      displayName,
      bio,
      avatarUrl,
      bannerUrl,
      ...stats,
    }
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
   * 从页面中提取用户名
   */
  private static extractUsername(_tree: Root): string {
    // 可以从URL或特定DOM元素中提取
    return ''
  }

  /**
   * 提取用户统计数据
   */
  private static extractProfileStats(tree: Root) {
    // 提取粉丝数、关注数、推文数等
    const _statsElement = HtmlParser.select(tree, SELECTORS.PROFILE.STATS)[0]

    return {
      followersCount: undefined,
      followingCount: undefined,
      tweetCount: undefined,
      isVerified: false,
      joinDate: undefined,
    }
  }

  /**
   * 提取头像URL
   */
  private static extractAvatarUrl(_tree: Root): string | undefined {
    // 提取头像图片URL
    return undefined
  }

  /**
   * 提取背景图URL
   */
  private static extractBannerUrl(_tree: Root): string | undefined {
    // 提取背景图URL
    return undefined
  }

  /**
   * 从 HTML 提取用户统计信息
   */
  static extractUserStats(_html: string, _tree?: Node): UserStats {
    // 解析 HTML 获取统计数据
    const stats: UserStats = {
      tweets: 0,
      following: 0,
      followers: 0,
    }

    try {
      // 查找统计信息容器
      const _statsElement = document.querySelector('[data-testid="userProfileStats"]')

      // 暂未实现具体解析逻辑

      return stats
    }
    catch {
      return stats
    }
  }

  /**
   * 从 HTML 提取用户链接
   */
  static extractUserLinks(_html: string, _tree?: Node): UserLink[] {
    // 暂未实现
    return []
  }

  /**
   * 从 HTML 提取用户加入日期
   */
  static extractJoinDate(_html: string, _tree?: Node): string | null {
    // 暂未实现
    return null
  }
}
