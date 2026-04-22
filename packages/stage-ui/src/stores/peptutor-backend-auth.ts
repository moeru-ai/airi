import type { PepTutorBackendAuthConfig } from '../utils/peptutor-backend-auth'

import {
  applyPepTutorBackendAuthResponseHeaders,
  buildPepTutorBackendAuthHeaders,
  isPepTutorAccessTokenExpiring,
  resolvePepTutorBackendAuth,
  resolvePepTutorBackendAuthFromEnv,
  resolvePepTutorBackendLoginConfig,
  setPepTutorBackendRuntimeAuth,
} from '../utils/peptutor-backend-auth'

interface PepTutorAuthStatusResponse {
  auth_configured?: boolean
  access_token?: string
}

interface PepTutorLoginResponse {
  access_token?: string
}

interface FetchPepTutorBackendOptions {
  auth?: PepTutorBackendAuthConfig
  retryUnauthorized?: boolean
  env?: ImportMetaEnv
}

let bootstrapPromise: Promise<PepTutorBackendAuthConfig | undefined> | null = null
let bootstrapCacheKey = ''

function normalizeLessonApiBaseUrl(value?: string | null): string {
  return value?.trim().replace(/\/+$/, '') || ''
}

function resolveLessonApiBaseUrl(env: ImportMetaEnv = import.meta.env): string {
  return normalizeLessonApiBaseUrl(env.VITE_PEPTUTOR_LESSON_API_URL)
}

function buildBootstrapCacheKey(baseUrl: string, username: string): string {
  return `${baseUrl}::${username}`
}

function buildLoginUrl(baseUrl: string): string {
  return `${baseUrl}/login`
}

function buildAuthStatusUrl(baseUrl: string): string {
  return `${baseUrl}/auth-status`
}

async function parseBackendAuthError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { detail?: string, message?: string }
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail.trim()
    }
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }
  }
  catch {
  }

  try {
    const text = await response.text()
    if (text.trim()) {
      return text.trim()
    }
  }
  catch {
  }

  return `PepTutor backend auth failed (${response.status})`
}

function mergeRequestHeaders(
  currentHeaders: RequestInit['headers'],
  auth: PepTutorBackendAuthConfig | undefined,
): RequestInit['headers'] {
  const authHeaders = buildPepTutorBackendAuthHeaders(auth)

  if (!currentHeaders) {
    return authHeaders
  }

  if (currentHeaders instanceof Headers) {
    const headers = new Headers(currentHeaders)
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
    return headers
  }

  if (Array.isArray(currentHeaders)) {
    const headers = new Headers(currentHeaders)
    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value)
    }
    return headers
  }

  return {
    ...currentHeaders,
    ...authHeaders,
  }
}

async function loginPepTutorBackend(
  baseUrl: string,
  username: string,
  password: string,
): Promise<PepTutorLoginResponse> {
  const response = await fetch(buildLoginUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username,
      password,
    }),
  })

  if (!response.ok) {
    throw new Error(await parseBackendAuthError(response))
  }

  const payload = await response.json() as PepTutorLoginResponse
  applyPepTutorBackendAuthResponseHeaders(response)
  return payload
}

async function fetchPepTutorAuthStatus(baseUrl: string): Promise<PepTutorAuthStatusResponse> {
  const response = await fetch(buildAuthStatusUrl(baseUrl), {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(await parseBackendAuthError(response))
  }

  const payload = await response.json() as PepTutorAuthStatusResponse
  applyPepTutorBackendAuthResponseHeaders(response)
  return payload
}

export async function bootstrapPepTutorBackendAuth(
  env: ImportMetaEnv = import.meta.env,
  options: { force?: boolean } = {},
): Promise<PepTutorBackendAuthConfig | undefined> {
  const baseUrl = resolveLessonApiBaseUrl(env)
  if (!baseUrl) {
    return resolvePepTutorBackendAuth(env)
  }

  const explicitEnvAuth = resolvePepTutorBackendAuthFromEnv(env)
  const loginConfig = resolvePepTutorBackendLoginConfig(env)
  const currentAuth = resolvePepTutorBackendAuth(env)

  if (explicitEnvAuth?.apiKey && !options.force) {
    return currentAuth
  }

  if (
    explicitEnvAuth?.accessToken
    && !isPepTutorAccessTokenExpiring(explicitEnvAuth.accessToken)
    && !options.force
  ) {
    return currentAuth
  }

  if (
    currentAuth?.accessToken
    && !isPepTutorAccessTokenExpiring(currentAuth.accessToken)
    && !options.force
  ) {
    return currentAuth
  }

  if (!loginConfig) {
    return currentAuth
  }

  const cacheKey = buildBootstrapCacheKey(baseUrl, loginConfig.username)
  if (!options.force && bootstrapPromise && bootstrapCacheKey === cacheKey) {
    return bootstrapPromise
  }

  const task = (async () => {
    const authStatus = await fetchPepTutorAuthStatus(baseUrl)

    if (!authStatus.auth_configured) {
      if (authStatus.access_token?.trim()) {
        return setPepTutorBackendRuntimeAuth({
          accessToken: authStatus.access_token.trim(),
          apiKey: explicitEnvAuth?.apiKey,
        })
      }

      return resolvePepTutorBackendAuth(env)
    }

    const loginResult = await loginPepTutorBackend(
      baseUrl,
      loginConfig.username,
      loginConfig.password,
    )

    const accessToken = loginResult.access_token?.trim()
    if (!accessToken) {
      throw new Error('PepTutor backend login succeeded but no access token was returned.')
    }

    return setPepTutorBackendRuntimeAuth({
      accessToken,
      apiKey: explicitEnvAuth?.apiKey,
    })
  })()

  bootstrapCacheKey = cacheKey
  bootstrapPromise = task.finally(() => {
    bootstrapPromise = null
  })

  return await bootstrapPromise
}

export async function fetchPepTutorBackend(
  input: string | URL,
  init: RequestInit = {},
  options: FetchPepTutorBackendOptions = {},
): Promise<Response> {
  const env = options.env || import.meta.env
  const auth = options.auth || resolvePepTutorBackendAuth(env)

  const requestInit = {
    ...init,
    headers: mergeRequestHeaders(init.headers, auth),
  } satisfies RequestInit

  let response = await fetch(input, requestInit)
  applyPepTutorBackendAuthResponseHeaders(response)

  if (response.status !== 401 || options.retryUnauthorized === false) {
    return response
  }

  const refreshedAuth = await bootstrapPepTutorBackendAuth(env, { force: true }).catch(() => undefined)
  if (!refreshedAuth || (!refreshedAuth.accessToken && !refreshedAuth.apiKey)) {
    return response
  }

  const retriedInit = {
    ...init,
    headers: mergeRequestHeaders(init.headers, refreshedAuth),
  } satisfies RequestInit

  response = await fetch(input, retriedInit)
  applyPepTutorBackendAuthResponseHeaders(response)
  return response
}
