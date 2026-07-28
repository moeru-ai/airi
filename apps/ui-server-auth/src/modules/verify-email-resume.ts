import { normalizeTrustedApiServerUrl } from './server-auth-context'

export interface VerifyEmailBroadcastEvent {
  type: 'verified'
  /**
   * Exact `continueURL` of the flow that completed verification.
   * Pending tabs ignore events whose key does not match their own continuation.
   */
  continuationKey: string
}

/**
 * Accepts only trusted AIRI OIDC authorize URLs used as email-verification
 * continuation targets.
 *
 * Before:
 * - `"https://api.airi.build/api/auth/oauth2/authorize?client_id=x"`
 * - `"https://attacker.example/api/auth/oauth2/authorize"`
 *
 * After:
 * - `"https://api.airi.build/api/auth/oauth2/authorize?client_id=x"`
 * - `null`
 */
export function normalizeTrustedAuthorizeContinueUrl(value: string): string | null {
  if (!value)
    return null

  let parsed: URL
  try {
    parsed = new URL(value)
  }
  catch {
    return null
  }

  const apiServerUrl = normalizeTrustedApiServerUrl(parsed.origin)
  if (
    !apiServerUrl
    || parsed.origin !== apiServerUrl
    || parsed.pathname !== '/api/auth/oauth2/authorize'
  ) {
    return null
  }

  return parsed.toString()
}

/**
 * Steam enrollment authorize URLs carry a single-use `enrollToken`. The email
 * success tab may resume those itself (Electron has no browser PKCE). Plain
 * web OIDC continuations must leave resume to the original pending tab.
 */
export function shouldVerifiedSuccessTabNavigate(continueURL: string): boolean {
  const trusted = normalizeTrustedAuthorizeContinueUrl(continueURL)
  if (!trusted)
    return false

  return new URL(trusted).searchParams.has('enrollToken')
}

export function buildVerifyEmailBroadcastEvent(continueURL: string): VerifyEmailBroadcastEvent | null {
  const trusted = normalizeTrustedAuthorizeContinueUrl(continueURL)
  if (!trusted)
    return null

  return {
    type: 'verified',
    continuationKey: trusted,
  }
}

export function broadcastMatchesContinuation(
  event: VerifyEmailBroadcastEvent | string | null | undefined,
  continueURL: string,
): boolean {
  if (!event || typeof event === 'string')
    return false

  if (event.type !== 'verified')
    return false

  const trusted = normalizeTrustedAuthorizeContinueUrl(continueURL)
  if (!trusted)
    return false

  return event.continuationKey === trusted
}
