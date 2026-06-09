export const SERVER_AUTH_UI_BASE_PATH = '/auth'
export const AUTH_UI_API_SERVER_URL_QUERY_PARAM = 'api_server_url'
export const DEFAULT_AUTH_UI_URL = 'https://accounts.airi.build/ui'
export const SERVER_DEV_API_SERVER_URL = 'https://airi-server-dev.up.railway.app'
export const SERVER_DEV_AUTH_UI_URL = 'https://server-dev.airi-server-auth.pages.dev/ui'

/**
 * Builds an absolute URL inside the externally hosted auth UI.
 *
 * Use when:
 * - Redirecting server-owned auth UI entrypoints to the standalone
 *   `apps/ui-server-auth` deployment.
 * - Preserving query parameters from OIDC, verification, or reset flows.
 *
 * Expects:
 * - `authUiUrl` is the public auth UI base, usually ending in `/ui`.
 * - `path` is the route path within the auth UI router.
 *
 * Returns:
 * - An absolute URL with the auth UI base path, normalized path, and search.
 */
export function buildAuthUiUrl(authUiUrl: string, path: string, search = ''): string {
  const target = new URL(authUiUrl)
  const basePath = target.pathname.replace(/\/+$/, '')
  const routePath = path.startsWith('/') ? path : `/${path}`

  target.pathname = `${basePath}${routePath}`
  target.search = search
  target.hash = ''

  return target.toString()
}

/**
 * Resolves the standalone auth UI base for the active server environment.
 *
 * Use when:
 * - The server redirects historical `/auth/*` entrypoints to the standalone UI.
 * - The server-dev Railway deployment needs the matching Cloudflare Pages
 *   branch without changing the production auth domain.
 *
 * Expects:
 * - `authUiUrl` is the configured auth UI base URL.
 * - `apiServerUrl` is the configured API server URL.
 *
 * Returns:
 * - The configured auth UI URL, except for the server-dev default pairing where
 *   the matching Pages branch URL is returned.
 */
export function resolveAuthUiUrl(authUiUrl: string, apiServerUrl: string): string {
  try {
    const authUi = new URL(authUiUrl)
    const defaultAuthUi = new URL(DEFAULT_AUTH_UI_URL)
    const apiServer = new URL(apiServerUrl)
    const authUiBase = `${authUi.origin}${authUi.pathname.replace(/\/+$/, '')}`
    const defaultAuthUiBase = `${defaultAuthUi.origin}${defaultAuthUi.pathname.replace(/\/+$/, '')}`

    if (authUiBase === defaultAuthUiBase && apiServer.origin === SERVER_DEV_API_SERVER_URL) {
      return SERVER_DEV_AUTH_UI_URL
    }
  }
  catch {
    return authUiUrl
  }

  return authUiUrl
}

/**
 * Maps a server `/auth/*` request to the standalone auth UI.
 *
 * Use when:
 * - The server keeps owning the historical `/auth/*` entrypoint but no longer
 *   packages the auth UI bundle.
 *
 * Expects:
 * - `requestUrl` is the incoming server URL.
 * - `authUiUrl` points to the standalone auth UI base path.
 *
 * Returns:
 * - The external auth UI URL preserving route suffix and query string.
 */
export function buildAuthUiRedirectUrl(authUiUrl: string, requestUrl: string, apiServerUrl?: string): string {
  const request = new URL(requestUrl)
  const suffix = request.pathname === SERVER_AUTH_UI_BASE_PATH
    ? '/'
    : request.pathname.slice(SERVER_AUTH_UI_BASE_PATH.length) || '/'
  const resolvedAuthUiUrl = apiServerUrl ? resolveAuthUiUrl(authUiUrl, apiServerUrl) : authUiUrl

  const target = new URL(buildAuthUiUrl(resolvedAuthUiUrl, suffix, request.search))
  if (apiServerUrl) {
    const apiServer = new URL(apiServerUrl)
    target.searchParams.set(AUTH_UI_API_SERVER_URL_QUERY_PARAM, apiServer.origin)
  }

  return target.toString()
}
