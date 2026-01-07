import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY_WEB } from '../../../../posthog.config'

posthog.init(POSTHOG_PROJECT_KEY_WEB, {
  ...DEFAULT_POSTHOG_CONFIG,
  // Project-specific config...
})
