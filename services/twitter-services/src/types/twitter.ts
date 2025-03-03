/**
 * Twitter 认证凭据
 */
export interface TwitterCredentials {
  username: string
  password: string
}

/**
 * 推文接口
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
 * 推文详情
 */
export interface TweetDetail extends Tweet {
  replies?: Tweet[]
  quotedTweet?: Tweet
}

/**
 * 用户资料
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
 * 时间线选项
 */
export interface TimelineOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  count?: number
  filter?: 'latest' | 'photos' | 'videos' | 'top'
}

/**
 * 发推选项
 */
export interface PostOptions {
  media?: string[]
  inReplyTo?: string
}

/**
 * 用户统计信息
 */
export interface UserStats {
  tweets: number
  following: number
  followers: number
}

/**
 * 用户链接信息
 */
export interface UserLink {
  type: string
  url: string
  title: string
}

/**
 * Twitter 服务接口
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
