import { electronOidcRedirectPath } from '@proj-airi/stage-shared/auth'
import { ofetch } from 'ofetch'

export interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

/**
 * Exchanges an authorization code for Electron OIDC tokens via `/oauth2/token`.
 *
 * Shared by the browser loopback path and Steam silent sign-in after
 * `desktop-sign-in` returns a short-lived code bound to the client's PKCE
 * challenge. The `redirect_uri` always matches the registered Electron client
 * URI.
 */
export async function exchangeAuthorizationCode(params: {
  serverUrl: string
  clientId: string
  code: string
  codeVerifier: string
}): Promise<TokenExchangeResult> {
  const baseUrl = params.serverUrl.replace(/\/+$/, '')
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: `${baseUrl}${electronOidcRedirectPath}`,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
    resource: baseUrl,
  })

  const data = await ofetch<Record<string, unknown>>(new URL('/api/auth/oauth2/token', params.serverUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    idToken: data.id_token as string | undefined,
    expiresIn: data.expires_in as number,
  }
}
