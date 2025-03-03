import type { Element, Node, Root } from 'hast'
import type { UserLink, UserProfile, UserStats } from '../types/twitter'

import { select } from 'hast-util-select'

import { SELECTORS } from '../utils/selectors'
import { HtmlParser } from './html-parser'

/**
 * Profile Parser
 * Extracts user profile information from HTML
 */
export class ProfileParser {
  /**
   * Parse user profile from HTML
   * @param html HTML string
   * @returns User profile
   */
  static parseUserProfile(html: string): UserProfile {
    const tree = HtmlParser.parse(html)

    // Extract username and display name
    const displayNameElement = HtmlParser.select(tree, SELECTORS.PROFILE.DISPLAY_NAME)[0]
    const displayName = this.extractTextContent(displayNameElement) || 'Unknown User'

    // Extract username from URL or DOM
    const username = this.extractUsername(tree) || 'unknown'

    // Extract user bio
    const bioElement = HtmlParser.select(tree, SELECTORS.PROFILE.BIO)[0]
    const bio = this.extractTextContent(bioElement)

    // Extract user stats
    const stats = this.extractProfileStats(tree)

    // Extract avatar and banner URL
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
   * Extract username from page
   */
  private static extractUsername(_tree: Root): string {
    // TODO: Can be extracted from URL or specific DOM element
    return ''
  }

  /**
   * Extract user stats
   */
  private static extractProfileStats(tree: Root) {
    // TODO: Extract followers, following, tweet count, etc.
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
   * Extract avatar URL
   */
  private static extractAvatarUrl(_tree: Root): string | undefined {
    // TODO: Extract avatar image URL
    return undefined
  }

  /**
   * Extract banner URL
   */
  private static extractBannerUrl(_tree: Root): string | undefined {
    // TODO: Extract banner image URL
    return undefined
  }

  /**
   * Extract user stats
   */
  static extractUserStats(_html: string, _tree?: Node): UserStats {
    // Parse HTML to get stats
    const stats: UserStats = {
      tweets: 0,
      following: 0,
      followers: 0,
    }

    try {
      // Find stats container
      const _statsElement = _tree ? select('[data-testid="userProfileStats"]', _tree as Root) : null

      // TODO: Not implemented yet

      return stats
    }
    catch {
      return stats
    }
  }

  /**
   * Extract user links
   */
  static extractUserLinks(_html: string, _tree?: Node): UserLink[] {
    // TODO: Not implemented yet
    return []
  }

  /**
   * Extract user join date
   */
  static extractJoinDate(_html: string, _tree?: Node): string | null {
    // TODO: Not implemented yet
    return null
  }
}
