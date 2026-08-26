import type { TwitterService } from '../../types/services'
import type { Context } from '../browser/context'

import { TWITTER_BASE_URL } from '../../constants'
import { logger } from '../../utils/logger'

/**
 * User Link
 */
export interface UserLink {
  title: string
  type: string
  url: string
}

/**
 * User Profile
 */
export interface UserProfile {
  avatarUrl?: string
  bannerUrl?: string
  bio?: string
  displayName: string
  followersCount?: number
  followingCount?: number
  isVerified?: boolean
  joinDate?: string
  tweetCount?: number
  username: string
}

/**
 * User Stats
 */
export interface UserStats {
  followers: number
  following: number
  tweets: number
}

export function useTwitterUserServices(ctx: Context): TwitterService {
  async function followUser(_username: string): Promise<boolean> {
    throw new Error('Not implemented')
  }

  async function getUserProfile(username: string): Promise<UserProfile> {
    try {
    // Navigate to user profile page
      await ctx.page.goto(`${TWITTER_BASE_URL}/${username}`)

      // Wait for profile elements to load
      await ctx.page.waitForSelector('[data-testid="UserName"]')

      // Get display name
      const displayNameElement = await ctx.page.$('[data-testid="UserName"] div span')
      const displayName = displayNameElement ? await displayNameElement.textContent() || username : username

      // Get bio
      const bioElement = await ctx.page.$('[data-testid="UserDescription"]')
      const bio = bioElement ? await bioElement.textContent() : undefined

      // Get avatar URL
      const avatarElement = await ctx.page.$('img[src*="/profile_images/"]')
      const avatarUrl = avatarElement ? await avatarElement.getAttribute('src') : undefined

      // Get follower/following counts
      const followElement = await ctx.page.$('[href$="/followers"]')
      const followingElement = await ctx.page.$('[href$="/following"]')

      const followerCount = followElement
        ? Number.parseInt((await followElement.textContent() || '0').replace(/\D/g, ''))
        : undefined

      const followingCount = followingElement
        ? Number.parseInt((await followingElement.textContent() || '0').replace(/\D/g, ''))
        : undefined

      return {
        avatarUrl: avatarUrl || undefined,
        bio: bio || undefined,
        displayName,
        followersCount: followerCount || undefined,
        followingCount: followingCount || undefined,
        username,
      }
    }
    catch (error) {
      logger.main.error('Error fetching user profile:', (error as Error).message)
      throw new Error(`Failed to fetch profile for @${username}`)
    }
  }

  return {
    followUser,
    getUserProfile,
  }
}
