import { generateCodeChallenge, generateCodeVerifier, generateState } from '@proj-airi/stage-shared/auth'

import { SERVER_URL } from './server'

// OIDC Authorization Code + PKCE client for all platforms.

const OIDC_AUTHORIZE_PATH = '/api/auth/oauth2/authorize'
const OIDC_TOKEN_PATH = '/api/auth/oauth2/token'
const OIDC_REVOKE_PATH = '/api/auth/oauth2/revoke'

/** Sends one form-encoded request to an OAuth endpoint of the server, as RFC 6749 and RFC 7009 require. */
async function postOAuthForm(path: string, params: Record<string, string>, init?: RequestInit): Promise<Response> {
  return await fetch(new URL(path, SERVER_URL), {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
}

export interface OIDCFlowParams {
  clientId: string
  redirectUri: string
  scopes?: string[]
  /**
   * Client secret — required when the OIDC client is registered as
   * confidential on the server. Omit for public clients.
   */
  clientSecret?: string
  /** Social provider hint — skips the server-side picker page. */
  provider?: 'google' | 'github' | 'steam'
}

export interface OIDCFlowState {
  codeVerifier: string
  state: string
}

/**
 * Build the full authorization URL and return the PKCE state that must be
 * persisted until the callback arrives.
 */
export async function buildAuthorizationURL(
  params: OIDCFlowParams,
): Promise<{ url: string, flowState: OIDCFlowState }> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateState()

  const scopes = params.scopes ?? ['openid', 'profile', 'email', 'offline_access']

  const url = new URL(OIDC_AUTHORIZE_PATH, SERVER_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', SERVER_URL)

  if (params.provider)
    url.searchParams.set('provider', params.provider)

  return {
    url: url.toString(),
    flowState: { codeVerifier, state },
  }
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

/**
 * Exchange an authorization code for tokens (RFC 6749 S4.1.3).
 * Pure function — does NOT write to any store. Caller is responsible
 * for persisting the returned tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  flowState: OIDCFlowState,
  params: OIDCFlowParams,
  returnedState: string,
): Promise<TokenResponse> {
  if (returnedState !== flowState.state)
    throw new Error('OIDC state mismatch — possible CSRF attack')

  const bodyParams: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: flowState.codeVerifier,
    resource: SERVER_URL,
  }

  // Confidential clients must send the secret during token exchange.
  if (params.clientSecret)
    bodyParams.client_secret = params.clientSecret

  const response = await postOAuthForm(OIDC_TOKEN_PATH, bodyParams)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${error}`)
  }

  return await response.json()
}

/**
 * Refresh an access token using a refresh token (RFC 6749 S6).
 * Pure function — returns new tokens without writing to any store.
 */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  const params: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: SERVER_URL,
  }

  if (clientSecret)
    params.client_secret = clientSecret

  const response = await postOAuthForm(OIDC_TOKEN_PATH, params)

  if (!response.ok)
    throw new TokenRefreshError(response.status, await readOAuthErrorCode(response))

  return await response.json()
}

/**
 * The token endpoint answered a refresh with an error status.
 *
 * The auth store reads `rejected` to choose between two outcomes. A rejected
 * refresh token cannot work again, so the store clears the credentials and asks
 * the user to sign in. Any other answer, for example a 5xx or a 429, can pass,
 * so the store keeps the credentials and retries later. A network error never
 * produces this class, because `fetch` rejects before a status exists.
 */
export class TokenRefreshError extends Error {
  constructor(
    readonly status: number,
    /** The OAuth `error` field of the answer, for example `invalid_grant`. Undefined when the body has no such field. */
    readonly code?: string,
  ) {
    super(`Token refresh failed: ${status}${code ? ` ${code}` : ''}`)
    this.name = 'TokenRefreshError'
  }

  /**
   * True when the server refused the grant or the client.
   * RFC 6749 section 5.2 answers `invalid_grant`, `invalid_client`, and the other OAuth errors with 400 or 401.
   */
  get rejected(): boolean {
    return this.status === 400 || this.status === 401
  }
}

async function readOAuthErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string')
      return body.error
  }
  catch {
    // A proxy or gateway can answer with HTML or an empty body. The status alone then decides the outcome.
  }
  return undefined
}

/**
 * Revoke a refresh token at the server (RFC 7009).
 *
 * The server marks the token as revoked, so a later refresh grant with it fails.
 * First-party clients are public, so `client_id` alone identifies the client.
 * The server answers 200 for an unknown token. Any other status throws.
 */
export async function revokeRefreshToken(clientId: string, refreshToken: string, init?: RequestInit): Promise<void> {
  const response = await postOAuthForm(OIDC_REVOKE_PATH, {
    token: refreshToken,
    token_type_hint: 'refresh_token',
    client_id: clientId,
  }, init)

  if (!response.ok)
    throw new Error(`Token revocation failed: ${response.status}`)
}

// Session storage keys for PKCE flow state (survives page navigation during OAuth)
const FLOW_STATE_KEY = 'auth/v1/oidc-flow-state'
const FLOW_PARAMS_KEY = 'auth/v1/oidc-flow-params'

/**
 * Persist OIDC flow state before navigating to the authorization server.
 */
export function persistFlowState(flowState: OIDCFlowState, params: OIDCFlowParams): void {
  sessionStorage.setItem(FLOW_STATE_KEY, JSON.stringify(flowState))
  sessionStorage.setItem(FLOW_PARAMS_KEY, JSON.stringify(params))
}

/**
 * Retrieve and clear persisted OIDC flow state after callback.
 */
export function consumeFlowState(): { flowState: OIDCFlowState, params: OIDCFlowParams } | null {
  const flowStateRaw = sessionStorage.getItem(FLOW_STATE_KEY)
  const paramsRaw = sessionStorage.getItem(FLOW_PARAMS_KEY)

  if (!flowStateRaw || !paramsRaw)
    return null

  sessionStorage.removeItem(FLOW_STATE_KEY)
  sessionStorage.removeItem(FLOW_PARAMS_KEY)

  return {
    flowState: JSON.parse(flowStateRaw),
    params: JSON.parse(paramsRaw),
  }
}
