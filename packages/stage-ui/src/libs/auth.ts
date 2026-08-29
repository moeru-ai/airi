import type { OIDCFlowParams, TokenResponse } from './auth-oidc'

import { useAuthStore } from '../stores/auth'
import { authClient } from './auth-client'
import { OIDC_CLIENT_ID, OIDC_REDIRECT_URI } from './auth-config'
import { buildAuthorizationURL, consumeFlowState, exchangeCodeForTokens, persistFlowState } from './auth-oidc'

export type OAuthProvider = 'google' | 'github' | 'steam'

/** An authorization request prepared by the shared OIDC flow. */
export interface AuthorizationRequest {
  /** URL of the hosted authorization endpoint. */
  authorizationUrl: string
  /** Social provider that should start immediately. @default undefined */
  provider?: OAuthProvider
}

/** Result returned by a platform authorization handler. */
export interface AuthorizationResult {
  /** Callback URL returned directly by the platform, when available. @default undefined */
  callbackUrl?: string
}

/** Starts authorization through the active app runtime. */
export type AuthorizationHandler = (request: AuthorizationRequest) => Promise<AuthorizationResult | void>

let authorizationHandler: AuthorizationHandler | undefined

/** Registers the authorization handler owned by the active app runtime. */
export function registerAuthorizationHandler(handler: AuthorizationHandler): void {
  authorizationHandler = handler
}

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

/** Starts authorization with the browser flow used by web renderers. */
export const browserAuthorizationHandler: AuthorizationHandler = async ({ authorizationUrl, provider }) => {
  if (!provider) {
    window.location.href = authorizationUrl
    return
  }

  if (provider === 'steam') {
    // Steam is OpenID 2.0; only the Steam plugin endpoint can start it.
    await authClient.signIn.steam({ callbackURL: authorizationUrl })
    return
  }

  await authClient.signIn.social({
    provider,
    callbackURL: authorizationUrl,
  })
}

/**
 * Completes an OIDC sign-in from a platform callback URL.
 *
 * The function returns false when the URL is not an OIDC callback.
 */
export async function completeOIDCSignIn(callbackUrl: string): Promise<boolean> {
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state)
    return false

  const persisted = consumeFlowState()
  if (!persisted)
    throw new Error('OIDC flow status has expired or is no longer valid.')

  const tokens = await exchangeCodeForTokens(code, persisted.flowState, persisted.params, state)
  await applyOIDCTokens(tokens, persisted.params.clientId)
  return true
}

/**
 * Initiate OIDC Authorization Code + PKCE sign-in flow.
 * Builds the authorization URL, persists PKCE state, and navigates.
 */
export async function signInOIDC(params: OIDCFlowParams) {
  const handler = authorizationHandler
  if (!handler)
    throw new Error('No authorization handler is registered for this app runtime.')

  const { provider, ...oidcParams } = params
  const { url, flowState } = await buildAuthorizationURL(oidcParams)
  persistFlowState(flowState, params)

  const result = await handler({
    authorizationUrl: url.toString(),
    provider,
  })
  if (result?.callbackUrl)
    await completeOIDCSignIn(result.callbackUrl)
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
