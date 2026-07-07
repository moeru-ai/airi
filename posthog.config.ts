/// <reference types="vite/client" />

import type { PostHogConfig } from 'posthog-js'

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (value == null)
    return false

  return /^(?:1|true|t|yes|y|on)$/i.test(value.trim())
}

// For Release workflows set `VITE_ENABLE_POSTHOG=true`.
export const POSTHOG_ENABLED = isEnvFlagEnabled(import.meta.env.VITE_ENABLE_POSTHOG)

// Single PostHog project for every AIRI surface (web / desktop / mobile).
// Platforms are told apart by the `surface` super property set at init, not
// by routing to separate per-platform projects.
export const POSTHOG_PROJECT_KEY
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY
    ?? 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

export const DEFAULT_POSTHOG_CONFIG = {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
} as const satisfies Partial<PostHogConfig>
