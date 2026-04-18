export interface PepTutorBackendAuthConfig {
  apiKey?: string
  accessToken?: string
}

export interface PepTutorBackendLoginConfig {
  username: string
  password: string
}

let runtimePepTutorBackendAuth: PepTutorBackendAuthConfig | undefined

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstDefinedString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeString(value)
    if (normalized) {
      return normalized
    }
  }

  return ''
}

function resolveBaseOrigin(): string {
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin) {
    return globalThis.location.origin
  }

  return 'http://localhost'
}

function base64UrlDecode(value: string): string | null {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')

  try {
    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(paddedValue)
    }
  }
  catch {
  }

  return null
}

export function resolvePepTutorBackendAuthFromEnv(env: ImportMetaEnv = import.meta.env): PepTutorBackendAuthConfig | undefined {
  const accessToken = firstDefinedString(
    env.VITE_PEPTUTOR_LESSON_BEARER_TOKEN,
    env.VITE_PEPTUTOR_LESSON_ACCESS_TOKEN,
  )
  const apiKey = firstDefinedString(env.VITE_PEPTUTOR_LESSON_API_KEY)

  if (!accessToken && !apiKey) {
    return undefined
  }

  return {
    accessToken,
    apiKey,
  }
}

export function resolvePepTutorBackendLoginConfig(env: ImportMetaEnv = import.meta.env): PepTutorBackendLoginConfig | undefined {
  const username = firstDefinedString(env.VITE_PEPTUTOR_LESSON_AUTH_USERNAME)
  const password = firstDefinedString(env.VITE_PEPTUTOR_LESSON_AUTH_PASSWORD)

  if (!username || !password) {
    return undefined
  }

  return {
    username,
    password,
  }
}

export function setPepTutorBackendRuntimeAuth(
  auth: PepTutorBackendAuthConfig | undefined,
): PepTutorBackendAuthConfig | undefined {
  runtimePepTutorBackendAuth = auth
    ? {
        accessToken: normalizeString(auth.accessToken),
        apiKey: normalizeString(auth.apiKey),
      }
    : undefined

  if (
    runtimePepTutorBackendAuth
    && !runtimePepTutorBackendAuth.accessToken
    && !runtimePepTutorBackendAuth.apiKey
  ) {
    runtimePepTutorBackendAuth = undefined
  }

  return runtimePepTutorBackendAuth
}

export function clearPepTutorBackendRuntimeAuthForTest() {
  runtimePepTutorBackendAuth = undefined
}

export function resolvePepTutorBackendAuth(env: ImportMetaEnv = import.meta.env): PepTutorBackendAuthConfig | undefined {
  const envAuth = resolvePepTutorBackendAuthFromEnv(env)

  if (!runtimePepTutorBackendAuth) {
    return envAuth
  }

  const mergedAuth = {
    accessToken: runtimePepTutorBackendAuth.accessToken || envAuth?.accessToken || '',
    apiKey: runtimePepTutorBackendAuth.apiKey || envAuth?.apiKey || '',
  }

  if (!mergedAuth.accessToken && !mergedAuth.apiKey) {
    return undefined
  }

  return mergedAuth
}

export function isPepTutorAccessTokenExpiring(
  token: string | undefined,
  withinSeconds: number = 60,
): boolean {
  const normalizedToken = normalizeString(token)
  if (!normalizedToken) {
    return true
  }

  const parts = normalizedToken.split('.')
  if (parts.length < 2) {
    return false
  }

  const payloadRaw = base64UrlDecode(parts[1] || '')
  if (!payloadRaw) {
    return false
  }

  try {
    const payload = JSON.parse(payloadRaw) as { exp?: number }
    const expireAtSeconds = typeof payload.exp === 'number' ? payload.exp : 0
    if (!expireAtSeconds) {
      return false
    }

    return expireAtSeconds <= Math.floor(Date.now() / 1000) + withinSeconds
  }
  catch {
    return false
  }
}

export function buildPepTutorBackendAuthHeaders(
  auth: PepTutorBackendAuthConfig | undefined = resolvePepTutorBackendAuth(),
): Record<string, string> {
  if (auth?.accessToken) {
    return {
      Authorization: `Bearer ${auth.accessToken}`,
    }
  }

  if (auth?.apiKey) {
    return {
      'X-API-Key': auth.apiKey,
    }
  }

  return {}
}

export function appendPepTutorBackendAuthQuery(
  url: string | URL,
  auth: PepTutorBackendAuthConfig | undefined = resolvePepTutorBackendAuth(),
): string {
  const resolvedUrl = url instanceof URL ? new URL(url.toString()) : new URL(url, resolveBaseOrigin())

  if (auth?.accessToken) {
    resolvedUrl.searchParams.set('access_token', auth.accessToken)
    resolvedUrl.searchParams.delete('api_key')
    return resolvedUrl.toString()
  }

  if (auth?.apiKey) {
    resolvedUrl.searchParams.set('api_key', auth.apiKey)
    resolvedUrl.searchParams.delete('access_token')
  }

  return resolvedUrl.toString()
}

export function applyPepTutorBackendAuthResponseHeaders(
  response: Response | Headers | { headers?: Pick<Headers, 'get'> } | undefined,
): string {
  const headers = response instanceof Headers ? response : response?.headers
  const newToken = normalizeString(headers?.get('X-New-Token'))
  if (!newToken) {
    return ''
  }

  const currentAuth = resolvePepTutorBackendAuth()
  setPepTutorBackendRuntimeAuth({
    accessToken: newToken,
    apiKey: currentAuth?.apiKey,
  })

  return newToken
}
