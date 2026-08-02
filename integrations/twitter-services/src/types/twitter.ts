/**
 * Twitter Service Types
 */

export interface SearchOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
  lang?: string
  resultType?: 'recent' | 'popular' | 'mixed'
  maxId?: string
  sinceId?: string
}

export interface TimelineOptions {
  count?: number
  includeReplies?: boolean
  includeRetweets?: boolean
  excludeReplies?: boolean
  includePromoted?: boolean
}
