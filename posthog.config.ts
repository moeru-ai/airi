/// <reference types="vite/client" />

import type { PostHogConfig } from 'posthog-js'

// These PostHog project API keys are considered public and are safe
// to be stored here as clear text.

export const POSTHOG_PROJECT_KEY_WEB
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY_WEB
    ?? 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

export const POSTHOG_PROJECT_KEY_DESKTOP
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY_DESKTOP
    ?? 'phc_rljw376z5gt6vXJlc3sTr7hFbXodciY9THEQXIRnW53'// cspell:disable-line

// FIXME: Using the same key for 'web' for now.
export const POSTHOG_PROJECT_KEY_POCKET
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY_POCKET
    ?? 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

// FIXME: Using the same key for 'web' for now.
export const POSTHOG_PROJECT_KEY_DOCS
  = import.meta.env.VITE_POSTHOG_PROJECT_KEY_DOCS
    ?? 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

export const DEFAULT_POSTHOG_CONFIG = {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
} as const satisfies Partial<PostHogConfig>
