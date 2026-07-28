import { resolveAuthUiUrl } from '../../../utils/auth-ui'

/**
 * Re-attaches a Steam enrollment bearer token onto a Better Auth login
 * redirect after authorize stripped it for the OIDC validator.
 *
 * Only mutates redirects that target this deployment's `/auth/sign-in` entry
 * or the configured standalone auth UI sign-in page. Other Locations (codes,
 * consent, attackers) are returned unchanged.
 */
export function attachEnrollTokenToTrustedLoginRedirect(
  response: Response,
  enrollToken: string,
  options: { apiServerUrl: string, authUiUrl: string },
): Response {
  if (response.status < 300 || response.status >= 400)
    return response

  const location = response.headers.get('location')
  if (!location)
    return response

  const base = new URL(options.apiServerUrl)
  let redirected: URL
  try {
    redirected = new URL(location, base)
  }
  catch {
    return response
  }

  if (!isTrustedLoginRedirect(redirected, options))
    return response

  redirected.searchParams.set('enrollToken', enrollToken)

  const headers = new Headers(response.headers)
  headers.set('location', formatRedirectLocation(location, redirected, base))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function isTrustedLoginRedirect(
  redirected: URL,
  options: { apiServerUrl: string, authUiUrl: string },
): boolean {
  const apiOrigin = new URL(options.apiServerUrl).origin
  const authUiBase = resolveAuthUiUrl(options.authUiUrl, options.apiServerUrl)
  let authUi: URL
  try {
    authUi = new URL(authUiBase)
  }
  catch {
    return false
  }

  const authUiBasePath = authUi.pathname.replace(/\/+$/, '')
  const path = redirected.pathname.replace(/\/+$/, '') || '/'

  if (redirected.origin === apiOrigin && path === '/auth/sign-in')
    return true

  if (redirected.origin === authUi.origin && path === `${authUiBasePath}/sign-in`)
    return true

  return false
}

/**
 * Prefer keeping relative Locations relative so Better Auth / reverse-proxy
 * behavior stays unchanged; absolute Locations stay absolute.
 */
function formatRedirectLocation(originalLocation: string, redirected: URL, apiBase: URL): string {
  if (/^https?:\/\//i.test(originalLocation))
    return redirected.toString()

  if (redirected.origin !== apiBase.origin)
    return redirected.toString()

  return `${redirected.pathname}${redirected.search}${redirected.hash}`
}
