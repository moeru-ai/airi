/**
 * Twitter Credentials
 */
export interface TwitterCredentials {
  username: string
  password: string
}

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
 * Tweet Detail
 */
export interface TweetDetail extends Tweet {
  replies?: Tweet[]
  quotedTweet?: Tweet
}

/**
 * User Profile
 */
export interface UserProfile {
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  bannerUrl?: string
  followersCount?: number
  followingCount?: number
  tweetCount?: number
  isVerified?: boolean
  joinDate?: string
}

/**
 * Timeline Options
 */
export interface TimelineOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
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
 * User Stats
 */
export interface UserStats {
  tweets: number
  following: number
  followers: number
}

/**
 * User Link
 */
export interface UserLink {
  type: string
  url: string
  title: string
}

/**
 * Twitter Service Interface
 */
export interface TwitterService {
  login: (credentials: TwitterCredentials) => Promise<boolean>
  getTimeline: (options?: TimelineOptions) => Promise<Tweet[]>
  getTweetDetails: (tweetId: string) => Promise<TweetDetail>
  searchTweets: (query: string, options?: SearchOptions) => Promise<Tweet[]>
  getUserProfile: (username: string) => Promise<UserProfile>
  followUser: (username: string) => Promise<boolean>
  likeTweet: (tweetId: string) => Promise<boolean>
  retweet: (tweetId: string) => Promise<boolean>
  postTweet: (content: string, options?: PostOptions) => Promise<string>
}
