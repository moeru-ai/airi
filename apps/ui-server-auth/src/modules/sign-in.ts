import type { OAuthProvider } from '@proj-airi/stage-ui/libs/auth'

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

  if (!oidcParams.size) {
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

  const data = await response.json() as {
    url?: unknown
    error?: unknown
  }

  if (typeof data.url === 'string')
    return data.url

  throw new Error(getSignInErrorMessage(data.error))
}

function getSignInErrorMessage(error: unknown): string {
  if (typeof error === 'string')
    return error

  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string')
    return error.message

  return 'Unexpected response'
}
