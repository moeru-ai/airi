/**
 * Twitter Service Types
 */

export interface SearchOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
  lang?: string
  maxId?: string
  resultType?: 'mixed' | 'popular' | 'recent'
  sinceId?: string
}

export interface TimelineOptions {
  count?: number
  excludeReplies?: boolean
  includePromoted?: boolean
  includeReplies?: boolean
  includeRetweets?: boolean
}
