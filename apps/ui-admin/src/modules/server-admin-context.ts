export interface ServerAdminBootstrapContext {
  apiServerUrl: string
  currentUrl: string
}

export interface AdminApiEnvironment {
  label: string
  value: string
  description: string
}

const SCRIPT_ID = 'airi-server-admin-context'
const API_SERVER_URL_QUERY_PARAM = 'api_server_url'

export const ADMIN_API_ENVIRONMENTS = [
  {
    label: 'Production',
    value: 'https://api.airi.build',
    description: 'api.airi.build',
  },
  {
    label: 'Testing',
    value: 'https://airi-server-dev.up.railway.app',
    description: 'airi-server-dev.up.railway.app',
  },
  {
    label: 'Local',
    value: 'http://localhost:3000',
    description: 'localhost:3000',
  },
] as const satisfies readonly AdminApiEnvironment[]

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

const DEFAULT_API_SERVER_ORIGINS_BY_ADMIN_UI_ORIGIN = new Map([
  ['https://admin.airi.build', 'https://api.airi.build'],
  ['https://server-dev.airi-server-admin.pages.dev', 'https://airi-server-dev.up.railway.app'],
])

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
  return import.meta.env.VITE_SERVER_URL || defaultStandaloneApiServerUrl(window.location.origin)
}

/**
 * Resolves the API origin for a standalone admin UI without redirect context.
 *
 * Before:
 * - "http://localhost:5178"
 *
 * After:
 * - "http://localhost:3000"
 */
export function defaultStandaloneApiServerUrl(currentOrigin: string): string {
  const origin = new URL(currentOrigin).origin
  const knownApiServerOrigin = DEFAULT_API_SERVER_ORIGINS_BY_ADMIN_UI_ORIGIN.get(origin)
  if (knownApiServerOrigin)
    return knownApiServerOrigin

  if (TRUSTED_LOCAL_API_SERVER_ORIGIN_PATTERNS.some(pattern => pattern.test(origin))) {
    const url = new URL(origin)
    url.port = '3000'
    return url.origin
  }

  return origin
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

export function apiEnvironmentValueFor(apiServerUrl: string): string {
  const origin = new URL(apiServerUrl).origin
  const known = ADMIN_API_ENVIRONMENTS.find(environment => environment.value === origin)
  if (known)
    return known.value

  if (TRUSTED_LOCAL_API_SERVER_ORIGIN_PATTERNS.some(pattern => pattern.test(origin)))
    return ADMIN_API_ENVIRONMENTS.find(environment => environment.label === 'Local')?.value ?? origin

  return origin
}

export function buildApiServerSwitchUrl(currentUrl: string, apiServerUrl: string): string {
  const url = new URL(currentUrl)
  const origin = new URL(apiServerUrl).origin
  url.searchParams.set(API_SERVER_URL_QUERY_PARAM, origin)
  return url.toString()
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
