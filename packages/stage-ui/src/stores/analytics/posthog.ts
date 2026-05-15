import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import posthog from 'posthog-js'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'

import {
  DEFAULT_POSTHOG_CONFIG,
  POSTHOG_ENABLED,
  POSTHOG_PROJECT_KEY_DESKTOP,
  POSTHOG_PROJECT_KEY_POCKET,
  POSTHOG_PROJECT_KEY_WEB,
} from '../../../../../posthog.config'

let posthogInitialized = false

function getPosthogProjectKey(): string {
  if (isStageTamagotchi())
    return POSTHOG_PROJECT_KEY_DESKTOP

  if (isStageCapacitor())
    return POSTHOG_PROJECT_KEY_POCKET

  return POSTHOG_PROJECT_KEY_WEB
}

export function isPosthogAvailableInBuild(): boolean {
  return POSTHOG_ENABLED
}

export function ensurePosthogInitialized(enabled: boolean): boolean {
  if (!POSTHOG_ENABLED)
    return false

  if (posthogInitialized)
    return true

  posthog.init(getPosthogProjectKey(), {
    ...DEFAULT_POSTHOG_CONFIG,
    opt_out_capturing_by_default: !enabled,
  })
  posthogInitialized = true
  return true
}

export function syncPosthogCapture(enabled: boolean): boolean {
  if (!POSTHOG_ENABLED)
    return false

  if (enabled) {
    ensurePosthogInitialized(true)

    if (posthog.has_opted_out_capturing())
      posthog.opt_in_capturing()

    return true
  }

  if (posthogInitialized && !posthog.has_opted_out_capturing())
    posthog.opt_out_capturing()

  return false
}

export function registerPosthogBuildInfo(buildInfo: AboutBuildInfo): void {
  if (!posthogInitialized)
    return

  posthog.register({
    app_version: (buildInfo.version && buildInfo.version !== '0.0.0') ? buildInfo.version : 'dev',
    app_commit: buildInfo.commit,
    app_branch: buildInfo.branch,
    app_build_time: buildInfo.builtOn,
  })
}

/**
 * Identify the current user on PostHog so server-side `payment_completed` /
 * `subscription_cancelled` events (which use the Better Auth user id as
 * `distinctId`) merge with the same person profile as the browser's
 * anonymous funnel start events. Without this call the funnel is broken
 * end-to-end: server events land on the user-id person, browser events
 * land on the anonymous device person, PostHog cannot join them.
 *
 * Expects:
 * - `userId` is the Better Auth user id (`user.id`) — must match what
 *   `apps/server/src/routes/stripe/index.ts` passes as `distinctId` in
 *   `capturePaymentCompleted`.
 */
export function identifyPosthogUser(userId: string): void {
  if (!posthogInitialized || posthog.has_opted_out_capturing())
    return
  // PostHog's `identify` is idempotent and aliases the anonymous distinct
  // id, so calling it on every auth-state-change is safe.
  posthog.identify(userId)
}

/**
 * Reset PostHog's distinct id on logout so subsequent activity from this
 * device is treated as a new anonymous user (not attributed to the prior
 * logged-in user, which would corrupt cohort analysis if a second user
 * signs in on the same device).
 */
export function resetPosthog(): void {
  if (!posthogInitialized)
    return
  posthog.reset()
}

interface PosthogCaptureOptions {
  send_instantly?: boolean
  transport?: 'XHR' | 'fetch' | 'sendBeacon'
}

/**
 * Single source-of-truth wrapper for emitting events from store-layer code
 * (places that can't pull `useAnalytics()` without creating circular
 * `analytics-store → use-analytics composable → analytics-store` graphs).
 * Returns `false` when capture was skipped so callers can gate dedup flags.
 *
 * Use when:
 * - You're inside a pinia store / Vue watcher that needs to fire a PostHog
 *   event. UI components should still prefer `useAnalytics()` composable
 *   for consistency with existing call sites.
 */
export function capturePosthogEvent(name: string, properties: Record<string, unknown>, options?: PosthogCaptureOptions): boolean {
  if (!posthogInitialized || posthog.has_opted_out_capturing())
    return false

  posthog.capture(name, properties, options)
  return true
}
