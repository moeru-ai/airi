import { SERVER_URL } from '@proj-airi/stage-ui/libs/server'

export interface ServerAuthBootstrapContext {
  apiServerUrl: string
  currentUrl: string
  oidcCallback?: {
    code: string
    error: string
    errorDescription: string
    state: string
  }
}

const SCRIPT_ID = 'airi-server-auth-context'
const API_SERVER_URL_QUERY_PARAM = 'api_server_url'

const TRUSTED_STANDALONE_API_SERVER_ORIGINS = [
  'https://api.airi.build',
  'https://airi-server-dev.up.railway.app',
]

const TRUSTED_HTTPS_API_SERVER_HOSTS = new Map(
  TRUSTED_STANDALONE_API_SERVER_ORIGINS.map((origin) => {
    const url = new URL(origin)
    return [url.hostname, origin]
  }),
)

const TRUSTED_LOCAL_API_SERVER_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/localhost(:\d+)?$/,
  /^https:\/\/127\.0\.0\.1(:\d+)?$/,
]

let cachedContext: ServerAuthBootstrapContext | null | undefined

export function getServerAuthBootstrapContext(): ServerAuthBootstrapContext | null {
  if (cachedContext !== undefined)
    return cachedContext

  const element = document.getElementById(SCRIPT_ID)
  if (!element) {
    cachedContext = resolveStandaloneServerAuthContext(window.location.href, SERVER_URL)
    return cachedContext
  }

  try {
    const parsed = JSON.parse(element.textContent ?? '') as Partial<ServerAuthBootstrapContext>
    cachedContext = {
      apiServerUrl: parsed.apiServerUrl ?? SERVER_URL,
      currentUrl: parsed.currentUrl ?? window.location.href,
      oidcCallback: parsed.oidcCallback,
    }
    return cachedContext
  }
  catch {
    cachedContext = resolveStandaloneServerAuthContext(window.location.href, SERVER_URL)
    return cachedContext
  }
}

/**
 * Resolves API-server context carried by server redirects into static auth UI.
 *
 * Use when:
 * - The standalone auth UI serves more than one AIRI environment from the same
 *   Pages deployment, such as production `accounts.airi.build` handling server-dev
 *   OIDC redirects.
 *
 * Expects:
 * - The server-owned `/auth/*` redirect sets `api_server_url`.
 * - Only known AIRI API origins and localhost development origins are accepted.
 *
 * Returns:
 * - A bootstrap context using the trusted API origin, or null when no trusted
 *   override is present.
 */
export function resolveStandaloneServerAuthContext(currentUrl: string, fallbackApiServerUrl: string): ServerAuthBootstrapContext | null {
  const url = new URL(currentUrl)
  const apiServerUrl = normalizeTrustedApiServerUrl(
    url.searchParams.get(API_SERVER_URL_QUERY_PARAM),
  )

  if (!apiServerUrl)
    return null

  return {
    apiServerUrl: apiServerUrl ?? fallbackApiServerUrl,
    currentUrl,
  }
}

function normalizeTrustedApiServerUrl(value: string | null): string | null {
  if (!value)
    return null

  try {
    const url = new URL(value)
    const normalizedHttpsOrigin = TRUSTED_HTTPS_API_SERVER_HOSTS.get(url.hostname)
    if (normalizedHttpsOrigin)
      return normalizedHttpsOrigin

    const origin = url.origin

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
