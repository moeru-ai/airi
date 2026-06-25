export const AUTH_UI_BASE_PATH = '/ui'
export const AUTH_UI_ROUTER_BASE_PATH = `${AUTH_UI_BASE_PATH}/`

/**
 * Normalizes auth UI route paths under the deployed `/ui` router base.
 *
 * Before:
 * - "/sign-in"
 * - "/auth/sign-in"
 *
 * After:
 * - "/ui/sign-in"
 * - "/ui/sign-in"
 */
export function buildAuthUiPath(path = '/'): string {
  const routePath = normalizeRoutePath(path)
  return routePath === '/'
    ? AUTH_UI_ROUTER_BASE_PATH
    : `${AUTH_UI_BASE_PATH}${routePath}`
}

/**
 * Builds an absolute auth UI URL on the current browser origin.
 *
 * Use when:
 * - Passing Better Auth callback URLs that must land back in ui-server-auth.
 * - Navigating from auth UI helper modules without depending on Vue Router.
 *
 * Expects:
 * - The caller runs in a browser context.
 *
 * Returns:
 * - An absolute URL under the `/ui` router base.
 */
export function buildCurrentOriginAuthUiUrl(path = '/'): string {
  return `${window.location.origin}${buildAuthUiPath(path)}`
}

function normalizeRoutePath(path: string): string {
  if (!path || path === '/')
    return '/'

  if (path === '/auth' || path.startsWith('/auth?') || path.startsWith('/auth#'))
    return `/${path.slice('/auth'.length)}`

  if (path === AUTH_UI_BASE_PATH || path.startsWith(`${AUTH_UI_BASE_PATH}?`) || path.startsWith(`${AUTH_UI_BASE_PATH}#`))
    return `/${path.slice(AUTH_UI_BASE_PATH.length)}`

  if (path.startsWith('/auth/'))
    return path.slice('/auth'.length)

  if (path.startsWith(`${AUTH_UI_BASE_PATH}/`))
    return path.slice(AUTH_UI_BASE_PATH.length)

  return path.startsWith('/') ? path : `/${path}`
}
