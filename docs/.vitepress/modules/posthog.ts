import posthog from 'posthog-js'

import { DEFAULT_POSTHOG_CONFIG, POSTHOG_PROJECT_KEY_DOCS } from '../../../posthog.config'

if (!import.meta.env.DEV) {
  posthog.init(POSTHOG_PROJECT_KEY_DOCS, {
    ...DEFAULT_POSTHOG_CONFIG,
  })
}
