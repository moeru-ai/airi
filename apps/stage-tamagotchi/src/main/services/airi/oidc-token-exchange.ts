import { ofetch } from 'ofetch'

export interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

/** Electron trusted-client redirect_uri used for code binding (loopback + Steam silent). */
export function electronOidcRedirectUri(serverUrl: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/api/auth/oidc/electron-callback`
}

/**
 * Exchanges an authorization code for Electron OIDC tokens via `/oauth2/token`.
 *
 * Shared by the browser loopback path and Steam silent sign-in after
 * `desktop-sign-in` returns a short-lived code bound to the client's PKCE challenge.
 */
export async function exchangeAuthorizationCode(params: {
  serverUrl: string
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
    resource: params.serverUrl.replace(/\/+$/, ''),
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
