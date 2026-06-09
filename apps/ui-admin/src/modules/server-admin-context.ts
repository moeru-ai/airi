export interface ServerAdminBootstrapContext {
  apiServerUrl: string
  currentUrl: string
}

const SCRIPT_ID = 'airi-server-admin-context'
const API_SERVER_URL_QUERY_PARAM = 'api_server_url'

const TRUSTED_STANDALONE_API_SERVER_ORIGINS = [
  'https://api.airi.build',
  'https://airi-server-dev.up.railway.app',
]

const TRUSTED_LOCAL_API_SERVER_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/localhost(:\d+)?$/,
  /^https:\/\/127\.0\.0\.1(:\d+)?$/,
]

let cachedContext: ServerAdminBootstrapContext | null | undefined

export function getServerAdminBootstrapContext(): ServerAdminBootstrapContext | null {
  if (cachedContext !== undefined)
    return cachedContext

  const element = document.getElementById(SCRIPT_ID)
  if (!element) {
    cachedContext = resolveStandaloneServerAdminContext(window.location.href)
    return cachedContext
  }

  try {
    const parsed = JSON.parse(element.textContent ?? '') as Partial<ServerAdminBootstrapContext>
    cachedContext = {
      apiServerUrl: parsed.apiServerUrl ?? defaultApiServerUrl(),
      currentUrl: parsed.currentUrl ?? window.location.href,
    }
    return cachedContext
  }
  catch {
    cachedContext = resolveStandaloneServerAdminContext(window.location.href)
    return cachedContext
  }
}

export function defaultApiServerUrl(): string {
  return import.meta.env.VITE_SERVER_URL || window.location.origin
}

/**
 * Resolves API-server context carried by server redirects into static admin UI.
 *
 * Use when:
 * - The standalone admin UI serves more than one AIRI environment from the same
 *   Pages deployment.
 *
 * Expects:
 * - The server-owned `/admin/*` redirect sets `api_server_url`.
 * - Only known AIRI API origins and localhost development origins are accepted.
 *
 * Returns:
 * - A bootstrap context using the trusted API origin, or null when no trusted
 *   override is present.
 */
export function resolveStandaloneServerAdminContext(currentUrl: string): ServerAdminBootstrapContext | null {
  const url = new URL(currentUrl)
  const apiServerUrl = normalizeTrustedApiServerUrl(
    url.searchParams.get(API_SERVER_URL_QUERY_PARAM),
  )

  if (!apiServerUrl)
    return null

  return {
    apiServerUrl,
    currentUrl,
  }
}

function normalizeTrustedApiServerUrl(value: string | null): string | null {
  if (!value)
    return null

  try {
    const origin = new URL(value).origin

    if (TRUSTED_STANDALONE_API_SERVER_ORIGINS.includes(origin))
      return origin

    if (TRUSTED_LOCAL_API_SERVER_ORIGIN_PATTERNS.some(pattern => pattern.test(origin)))
      return origin

    return null
  }
  catch {
    return null
  }
}
