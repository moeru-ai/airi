export const SERVER_ADMIN_UI_BASE_PATH = '/admin'
export const ADMIN_UI_API_SERVER_URL_QUERY_PARAM = 'api_server_url'
export const DEFAULT_ADMIN_UI_URL = 'https://admin.airi.build'
export const SERVER_DEV_API_SERVER_URL = 'https://airi-server-dev.up.railway.app'
export const SERVER_DEV_ADMIN_UI_URL = 'https://server-dev.airi-server-admin.pages.dev'

/**
 * Builds an absolute URL inside the externally hosted admin UI.
 *
 * Use when:
 * - Redirecting server-owned admin UI entrypoints to the standalone
 *   admin UI deployment from the `proj-airi` repository.
 * - Preserving dashboard route paths and query parameters.
 *
 * Expects:
 * - `adminUiUrl` is the public admin UI base.
 * - `path` is the route path within the admin UI router.
 *
 * Returns:
 * - An absolute URL with the admin UI base path, normalized path, and search.
 */
export function buildAdminUiUrl(adminUiUrl: string, path: string, search = ''): string {
  const target = new URL(adminUiUrl)
  const basePath = target.pathname.replace(/\/+$/, '')
  const routePath = path.startsWith('/') ? path : `/${path}`

  target.pathname = `${basePath}${routePath}`
  target.search = search
  target.hash = ''

  return target.toString()
}

/**
 * Resolves the standalone admin UI base for the active server environment.
 *
 * Use when:
 * - The server redirects historical `/admin/*` entrypoints to the standalone UI.
 * - The server-dev Railway deployment needs the matching Cloudflare Pages
 *   branch without changing the production admin domain.
 *
 * Expects:
 * - `adminUiUrl` is the configured admin UI base URL.
 * - `apiServerUrl` is the configured API server URL.
 *
 * Returns:
 * - The configured admin UI URL, except for the server-dev default pairing where
 *   the matching Pages branch URL is returned.
 */
export function resolveAdminUiUrl(adminUiUrl: string, apiServerUrl: string): string {
  try {
    const adminUi = new URL(adminUiUrl)
    const defaultAdminUi = new URL(DEFAULT_ADMIN_UI_URL)
    const apiServer = new URL(apiServerUrl)
    const adminUiBase = `${adminUi.origin}${adminUi.pathname.replace(/\/+$/, '')}`
    const defaultAdminUiBase = `${defaultAdminUi.origin}${defaultAdminUi.pathname.replace(/\/+$/, '')}`

    if (adminUiBase === defaultAdminUiBase && apiServer.origin === SERVER_DEV_API_SERVER_URL) {
      return SERVER_DEV_ADMIN_UI_URL
    }
  }
  catch {
    return adminUiUrl
  }

  return adminUiUrl
}

/**
 * Maps a server `/admin/*` request to the standalone admin UI.
 *
 * Use when:
 * - The server keeps owning the historical `/admin/*` entrypoint but no longer
 *   packages the admin UI bundle.
 *
 * Expects:
 * - `requestUrl` is the incoming server URL.
 * - `adminUiUrl` points to the standalone admin UI base.
 *
 * Returns:
 * - The external admin UI URL preserving route suffix and query string.
 */
export function buildAdminUiRedirectUrl(adminUiUrl: string, requestUrl: string, apiServerUrl?: string): string {
  const request = new URL(requestUrl)
  const suffix = request.pathname === SERVER_ADMIN_UI_BASE_PATH
    ? '/'
    : request.pathname.slice(SERVER_ADMIN_UI_BASE_PATH.length) || '/'
  const resolvedAdminUiUrl = apiServerUrl ? resolveAdminUiUrl(adminUiUrl, apiServerUrl) : adminUiUrl

  const target = new URL(buildAdminUiUrl(resolvedAdminUiUrl, suffix, request.search))
  if (apiServerUrl) {
    const apiServer = new URL(apiServerUrl)
    target.searchParams.set(ADMIN_UI_API_SERVER_URL_QUERY_PARAM, apiServer.origin)
  }

  return target.toString()
}
