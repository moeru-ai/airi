import type { PostHogConfig } from 'posthog-js'

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (value == null)
    return false

  return /^(?:1|true|t|yes|y|on)$/i.test(value.trim())
}

/** Whether client analytics is enabled for the current Vite build. */
export const POSTHOG_ENABLED = isEnvFlagEnabled(import.meta.env.VITE_ENABLE_POSTHOG)

/** The shared PostHog project key used by every AIRI client surface. */
export const POSTHOG_PROJECT_KEY
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY
    ?? 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

/** Shared PostHog defaults for AIRI single-page applications. */
export const DEFAULT_POSTHOG_CONFIG = {
  api_host: 'https://t.airi.build',
  // This preset captures page views on history changes. PostHog then also
  // captures page leaves, which keeps route-level dwell time measurable.
  defaults: '2025-05-24',
  person_profiles: 'identified_only',
} as const satisfies Partial<PostHogConfig>
