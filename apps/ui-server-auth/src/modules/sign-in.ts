import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

import { extractAuthError } from './auth-fetch'

export interface ServerSignInContext {
  callbackURL: string
  requestedProvider: string | null
}

export interface SocialSignInRedirectParams {
  apiServerUrl: string
  provider: OAuthProvider
  callbackURL: string
  fetchImpl?: typeof fetch
}

export function createServerSignInContext(currentUrl: string, apiServerUrl: string): ServerSignInContext {
  const url = new URL(currentUrl)
  const oidcParams = new URLSearchParams(url.searchParams)
  const requestedProvider = oidcParams.get('provider')

  oidcParams.delete('provider')
  oidcParams.delete('prompt')

  // NOTICE:
  // Only synthesize an OIDC authorize callback when the page query genuinely
  // looks like an OIDC handoff. Without this guard, a stray `?token=...` —
  // e.g. the 24-char password-reset token better-auth appends when it
  // redirects through redirectTo (better-auth/dist/api/routes/password.mjs L65, L118)
  // back into /auth/sign-in — would synthesize
  // `/api/auth/oauth2/authorize?token=...` as the callback. The OIDC zod
  // schema then rejects it for missing client_id / response_type
  // (oauth-provider/dist/index.mjs L2808-2826) and the user sees a
  // VALIDATION_ERROR instead of the sign-in form.
  // Removal condition: redirectTo origins are exhaustively scoped so reset /
  // verification redirects can never land on /auth/sign-in carrying a `token`.
  if (!oidcParams.has('client_id') || !oidcParams.has('response_type')) {
    return {
      callbackURL: '/',
      requestedProvider,
    }
  }

  const authorizeUrl = new URL('/api/auth/oauth2/authorize', apiServerUrl)
  authorizeUrl.search = oidcParams.toString()

  return {
    callbackURL: authorizeUrl.toString(),
    requestedProvider,
  }
}

export async function requestSocialSignInRedirect(params: SocialSignInRedirectParams): Promise<string> {
  const fetchImpl = params.fetchImpl ?? fetch
  const endpoint = new URL('/api/auth/sign-in/social', params.apiServerUrl)
  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: params.provider,
      callbackURL: params.callbackURL,
    }),
    credentials: 'include',
    redirect: 'manual',
  })

  if (response.type === 'opaqueredirect' || response.status === 302) {
    return response.headers.get('location') || '/'
  }

  const data = await response.json() as { url?: unknown }

  if (typeof data.url === 'string')
    return data.url

  throw new Error(extractAuthError(data) ?? 'Unexpected response')
}
