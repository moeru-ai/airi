/**
 * Provider-neutral analytics for the auth-only SPA (`apps/ui-server-auth`).
 *
 * This surface captures anonymous auth-UI milestones such as form completion,
 * sign-in attempts, email verification, and password recovery. Canonical
 * registration facts come from the server as identified `signup_completed`
 * events; the auth SPA intentionally uses `signup_form_completed` so an event
 * emitted before {@link identifyAuthUser} cannot double-count a new user.
 *
 * Unlike the stage apps there is no in-app analytics consent toggle here
 * (the user isn't signed in yet, so there's no settings store to read).
 * Capture posture matches the docs site: the optional provider is enabled by
 * the application entry in configured builds and disclosed via the privacy
 * policy linked on the sign-in page.
 */

import type { OauthCallbackFailureStage } from '@proj-airi/stage-ui/composables'

/** Login/signup credential kinds shown on the sign-in page. */
export type AuthMethod = 'email' | 'github' | 'google' | 'steam'

interface CaptureOptions {
  /**
   * Set when navigation immediately follows capture. Adapters can select a
   * transport that survives document unload.
   */
  beforeNavigation?: boolean
}

/** Adapter contract installed by an optional analytics provider chunk. */
export interface AnalyticsAdapter {
  capture: (event: string, properties: Record<string, unknown>, options?: CaptureOptions) => void
  identify: (userId: string) => void
}

type PendingOperation
  = | { kind: 'capture', event: string, properties: Record<string, unknown>, options?: CaptureOptions }
    | { kind: 'identify', userId: string }

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable'

/**
 * Owns optional-adapter loading and guarantees that product-event calls never
 * make core auth UI wait for, or depend on, a provider SDK.
 */
export class AnalyticsClient {
  private adapter: AnalyticsAdapter | undefined
  private loadPromise: Promise<boolean> | undefined
  private loadState: LoadState = 'idle'
  private readonly pendingOperations: PendingOperation[] = []

  load(loader: () => Promise<AnalyticsAdapter>): Promise<boolean> {
    if (this.loadPromise)
      return this.loadPromise

    this.loadState = 'loading'
    this.loadPromise = Promise.resolve()
      .then(loader)
      .then((adapter) => {
        this.adapter = adapter
        this.loadState = 'ready'
        this.flush()
        return true
      })
      .catch(() => {
        // Content blockers commonly reject the provider's module request. The
        // provider is optional, so discard queued telemetry and stay no-op.
        this.pendingOperations.length = 0
        this.loadState = 'unavailable'
        return false
      })

    return this.loadPromise
  }

  capture(event: string, properties: Record<string, unknown>, options?: CaptureOptions): void {
    if (this.adapter) {
      this.adapter.capture(event, properties, options)
      return
    }

    if (this.loadState === 'loading')
      this.enqueue({ kind: 'capture', event, properties, options })
  }

  identify(userId: string): void {
    if (this.adapter) {
      this.adapter.identify(userId)
      return
    }

    if (this.loadState === 'loading')
      this.enqueue({ kind: 'identify', userId })
  }

  private enqueue(operation: PendingOperation): void {
    // A provider may remain slow indefinitely. Bound memory while preserving
    // the newest auth funnel steps, which are the most useful after recovery.
    if (this.pendingOperations.length === 100)
      this.pendingOperations.shift()
    this.pendingOperations.push(operation)
  }

  private flush(): void {
    if (!this.adapter)
      return

    for (const operation of this.pendingOperations) {
      if (operation.kind === 'identify')
        this.adapter.identify(operation.userId)
      else
        this.adapter.capture(operation.event, operation.properties, operation.options)
    }
    this.pendingOperations.length = 0
  }
}

const analytics = new AnalyticsClient()

/**
 * Starts loading the optional provider adapter without exposing its SDK to
 * pages or to the application's static module graph.
 */
export function loadAnalyticsAdapter(loader: () => Promise<AnalyticsAdapter>): Promise<boolean> {
  return analytics.load(loader)
}

/**
 * Merge this browser's anonymous events with the Better Auth user person.
 * `userId` must be the Better Auth `user.id` — the same value the server
 * uses as `distinctId` (see `server/apps/api` product events forwarding).
 */
export function identifyAuthUser(userId: string): void {
  analytics.identify(userId)
}

function capture(event: string, properties: Record<string, unknown>, options?: CaptureOptions): void {
  analytics.capture(event, properties, options)
}

/** Anonymous email-signup UI milestone; the server owns the registration fact. */
export function trackSignupFormCompleted(properties: { source: AuthMethod, requires_verification: boolean }): void {
  capture('signup_form_completed', properties, { beforeNavigation: !properties.requires_verification })
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
