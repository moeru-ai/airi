import type { useTwitterTimelineServices } from '../core/services/timeline'
import type { useTwitterTweetServices } from '../core/services/tweet'
import type { useTwitterUserServices } from '../core/services/user'

export interface TwitterServices {
  timeline: ReturnType<typeof useTwitterTimelineServices>
  tweet: ReturnType<typeof useTwitterTweetServices>
  user: ReturnType<typeof useTwitterUserServices>
}
