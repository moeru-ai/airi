import type { OIDCFlowParams, TokenResponse } from './auth-oidc'

import { useAuthStore } from '../stores/auth'
import { authClient } from './auth-client'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from './auth-config'
import { buildAuthorizationURL, persistFlowState } from './auth-oidc'

export type OAuthProvider = 'google' | 'github' | 'steam'

/** Returns the access token from the active auth store. */
export function getAuthToken(): string | null {
  return useAuthStore().token
}

export { authClient }

export async function initializeAuth() {
  await useAuthStore().initialize()
}

/**
 * Persist OIDC tokens locally and schedule refresh.
 */
export async function applyOIDCTokens(tokens: TokenResponse, clientId: string): Promise<void> {
  await useAuthStore().completeSignIn({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    expiresIn: tokens.expires_in,
    clientId,
  })
}

export async function fetchSession() {
  return await useAuthStore().fetchSession()
}

export async function listSessions() {
  return await useAuthStore().listSessions()
}

export async function signOut() {
  await useAuthStore().signOut()
}

/**
 * Initiate OIDC Authorization Code + PKCE sign-in flow.
 * Builds the authorization URL, persists PKCE state, and navigates.
 */
export async function signInOIDC(params: OIDCFlowParams) {
  const { provider, ...oidcParams } = params
  const { url, flowState } = await buildAuthorizationURL(oidcParams)
  persistFlowState(flowState, params)

  if (!provider) {
    window.location.href = url
    return
  }

  if (provider === 'steam') {
    // Steam is OpenID 2.0; only the Steam plugin endpoint can start it.
    await authClient.signIn.steam({ callbackURL: url.toString() })
    return
  }

  await authClient.signIn.social({
    provider,
    callbackURL: url.toString(),
  })
}

/**
 * Trigger the project-default OIDC sign-in flow.
 *
 * Use when:
 * - Any UI surface needs to start a login (top-nav button, 401 handler,
 *   onboarding gate, "Try again" on a failed callback). Sign-in is an
 *   action, not a page — callers do NOT navigate to a sign-in route first.
 *
 * Expects:
 * - `auth-config.ts` provides `OIDC_CLIENT_ID` and `OIDC_REDIRECT_URI` for
 *   the current app (web vs. tamagotchi vs. pocket).
 *
 * Returns:
 * - Resolves after the browser has been navigated. In practice the page
 *   unloads, so callers usually do not see the resolution.
 *
 * `opts.provider` (optional): skip the picker page and jump straight to a
 * social provider. Omit to land on the project's hosted login page
 * (ui-server-auth) where the user can choose email/password or social.
 */
export async function triggerSignIn(opts?: { provider?: OAuthProvider }): Promise<void> {
  await signInOIDC({
    clientId: OIDC_CLIENT_ID,
    redirectUri: OIDC_REDIRECT_URI,
    ...opts,
  })
}
