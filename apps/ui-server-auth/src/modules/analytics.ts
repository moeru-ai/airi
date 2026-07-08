/**
 * PostHog product analytics for the auth-only SPA (`apps/ui-server-auth`).
 *
 * This surface is the top of the activation funnel: sign-up, sign-in, email
 * verification, password recovery. Events captured here are the funnel
 * entry that the in-app surfaces (`signup_completed → onboarding_started →
 * first message`) join against, keyed by the Better Auth user id passed to
 * {@link identifyAuthUser} — the same id the server uses as `distinctId`
 * for its own events, so the person profiles merge.
 *
 * Unlike the stage apps there is no in-app analytics consent toggle here
 * (the user isn't signed in yet, so there's no settings store to read).
 * Capture posture matches the docs site: enabled in analytics-enabled
 * builds (`VITE_ENABLE_POSTHOG`), disclosed via the privacy policy linked
 * on the sign-in page.
 */

import type { OauthCallbackFailureStage } from '@proj-airi/stage-ui/composables'

import posthog from 'posthog-js'

import {
  DEFAULT_POSTHOG_CONFIG,
  POSTHOG_ENABLED,
  POSTHOG_PROJECT_KEY,
} from '../../../../posthog.config'

/** Login/signup credential kinds shown on the sign-in page. */
export type AuthMethod = 'email' | 'github' | 'google'

let initialized = false

/**
 * Initialize PostHog for the auth surface. Call once from `main.ts` before
 * mount; later calls are no-ops. Returns whether capture is active so
 * callers can skip building event payloads in analytics-disabled builds.
 */
export function initAuthAnalytics(): boolean {
  if (!POSTHOG_ENABLED)
    return false

  if (initialized)
    return true

  posthog.init(POSTHOG_PROJECT_KEY, { ...DEFAULT_POSTHOG_CONFIG })
  // Same single-project setup as the stage apps: the `surface` super
  // property is how auth traffic is told apart in shared dashboards.
  posthog.register({ surface: 'auth' })
  initialized = true
  return true
}

/**
 * Merge this browser's anonymous events with the Better Auth user person.
 * `userId` must be the Better Auth `user.id` — the same value the server
 * uses as `distinctId` (see `apps/server` product events forwarding).
 */
export function identifyAuthUser(userId: string): void {
  if (!initialized)
    return
  posthog.identify(userId)
}

interface CaptureOptions {
  /**
   * Set when navigation immediately follows the capture call
   * (`window.location.href = ...`). The batched queue would race the
   * unload and drop the event; sendBeacon survives it.
   */
  beforeNavigation?: boolean
}

function capture(event: string, properties: Record<string, unknown>, options?: CaptureOptions): void {
  if (!initialized)
    return

  posthog.capture(
    event,
    properties,
    options?.beforeNavigation ? { send_instantly: true, transport: 'sendBeacon' } : undefined,
  )
}

/** Activation funnel step 1 — the account now exists (email flow). */
export function trackSignupCompleted(properties: { source: AuthMethod, requires_verification: boolean }): void {
  capture('signup_completed', properties, { beforeNavigation: !properties.requires_verification })
}

/**
 * OAuth flows leave the page before their outcome is knowable, so the
 * client can only record the attempt; completion shows up as the
 * identified session on the callback landing.
 */
export function trackLoginStarted(properties: { method: AuthMethod }): void {
  capture('login_started', properties, { beforeNavigation: true })
}

/** Credential sign-in succeeded; OIDC continuation navigation follows. */
export function trackLoginSucceeded(properties: { method: AuthMethod }): void {
  capture('login_succeeded', properties, { beforeNavigation: true })
}

/**
 * Sign-in attempt failed. No error detail on purpose — auth error messages
 * can embed the email address, and the count per method is what the funnel
 * needs.
 */
export function trackLoginFailed(properties: { method: AuthMethod }): void {
  capture('login_failed', properties)
}

/** Verification link landing with `?verified=true`. */
export function trackEmailVerificationCompleted(): void {
  capture('email_verification_completed', {})
}

/** Verification link landing with `?error=...`. */
export function trackEmailVerificationFailed(): void {
  capture('email_verification_failed', {})
}

export function trackPasswordResetRequested(): void {
  capture('password_reset_requested', {})
}

export function trackPasswordResetCompleted(): void {
  capture('password_reset_completed', {})
}

export function trackPasswordChanged(): void {
  capture('password_changed', {})
}

/**
 * Link handed off to the provider's consent page. Completion is not
 * client-observable (it lands back via a full-page OAuth redirect), so the
 * funnel pairs this with the refreshed linked-accounts state server-side.
 */
export function trackOauthProviderLinkStarted(properties: { provider: string }): void {
  capture('oauth_provider_link_started', properties, { beforeNavigation: true })
}

export function trackOauthProviderUnlinked(properties: { provider: string }): void {
  capture('oauth_provider_unlinked', properties)
}

/**
 * Deletion-confirmed landing page reached (`delete-account.vue`). The
 * deletion request itself is raised from the stage apps' account settings.
 */
export function trackAccountDeletionCompleted(): void {
  capture('account_deletion_completed', {})
}

export function trackSignedOut(): void {
  capture('signed_out', {})
}

/**
 * Electron OIDC relay handoff failed. `stage` distinguishes a malformed
 * callback (`parse`) from an unreachable local app (`relay_unreachable`);
 * the full cross-surface vocabulary lives in stage-ui's
 * `OauthCallbackFailureStage` so the two emitters share one schema.
 */
export function trackOauthCallbackFailed(properties: { stage: Extract<OauthCallbackFailureStage, 'parse' | 'relay_unreachable'> }): void {
  capture('oauth_callback_failed', properties)
}
