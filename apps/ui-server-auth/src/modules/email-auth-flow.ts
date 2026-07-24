import type { CheckEmailResult } from './email-password'

export type EmailStep = 'identify' | 'password' | 'create'

/**
 * Picks the next auth step from an email-identifier probe result.
 *
 * Before:
 * - `{ exists: false, hasPassword: false }`
 * - `{ exists: true, hasPassword: true }`
 * - `{ exists: true, hasPassword: false }`
 *
 * After:
 * - `'create'` (new email → email + password sign-up)
 * - `'password'` (existing credential user)
 * - `'social-only'` (existing social-only user — keep OAuth buttons visible)
 */
export function decideEmailStep(result: CheckEmailResult): EmailStep | 'social-only' {
  if (result.exists && !result.hasPassword)
    return 'social-only'
  return result.exists ? 'password' : 'create'
}

export interface EnrollContext {
  enrollToken: string
  continueUrl: string
  apiServerUrl: string
}

/**
 * Parses the Steam enrollment query (`token` + `continue`) carried on the
 * enroll page URL opened by Electron.
 *
 * Use when:
 * - The enroll page mounts and needs the enrollment token plus the OIDC
 *   authorize URL to navigate to after the user authenticates.
 *
 * The API server origin is derived from `continue` (the authorize URL always
 * lives on the API server), so the enroll page talks to the right backend
 * without a separate `api_server_url` param.
 *
 * Returns:
 * - The parsed context, or `null` when `token` / `continue` are missing or
 *   `continue` is not a valid URL.
 */
export function createEnrollContext(currentUrl: string): EnrollContext | null {
  const url = new URL(currentUrl)
  const enrollToken = url.searchParams.get('token')
  const continueUrl = url.searchParams.get('continue')
  if (!enrollToken || !continueUrl)
    return null

  let continueOrigin: string
  try {
    continueOrigin = new URL(continueUrl).origin
  }
  catch {
    return null
  }

  return {
    enrollToken,
    continueUrl,
    apiServerUrl: continueOrigin,
  }
}

/**
 * Builds the Better Auth email-verification `callbackURL` with `api_server_url`
 * and optional `continueURL` so the email-opened tab can resume OIDC/enroll.
 *
 * Before:
 * - `https://auth.example/ui/verify-email`
 *
 * After:
 * - `...?verified=true&api_server_url=...&continueURL=...`
 */
export function buildVerifyEmailCallbackUrl(params: {
  verifyEmailPath: string
  apiServerUrl: string
  apiServerUrlQueryParam: string
  continueURL?: string
}): string {
  const url = new URL(params.verifyEmailPath)
  url.searchParams.set('verified', 'true')
  url.searchParams.set(params.apiServerUrlQueryParam, params.apiServerUrl)
  if (params.continueURL)
    url.searchParams.set('continueURL', params.continueURL)
  return url.toString()
}
