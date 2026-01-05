import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY_POCKET } from '../../../../posthog.config'

posthog.init(POSTHOG_PROJECT_KEY_POCKET, {
  ...DEFAULT_POSTHOG_CONFIG,
  // Project-specific config...
})
