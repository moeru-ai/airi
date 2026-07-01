import { defaultApiServerUrl, getServerAdminBootstrapContext } from './server-admin-context'

export interface AdminUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  updatedAt: string
  flux: number
  stripeCustomerId: string | null
}

export interface AdminMe {
  role: 'admin'
  user: Pick<AdminUser, 'id' | 'name' | 'email' | 'emailVerified' | 'image'>
}

export interface AdminMetrics {
  totalUsers: number
  verifiedUsers: number
  activeSessions: number
  currentFlux: number
  issuedFlux: number
  llmRequests24h: number
  llmFlux24h: number
  adminSeats: number
  grafanaEmbedUrl: string | null
}

export interface FluxTransaction {
  id: string
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  description: string
  metadata: unknown
  createdAt: string
}

export interface AdminUsersPage {
  users: AdminUser[]
  hasMore: boolean
  nextOffset: number | null
  total: number
}

export interface AdminRouterOpenRouterSlice {
  kind: 'openrouter'
  modelName: string
  overrideModel: string
  plaintextKey?: string
  baseURL?: string
  keyEntryId?: string
  existingKeyEntryId?: string
  headerTemplate?: string
}

export interface AdminRouterBedrockSlice {
  kind: 'bedrock'
  modelName: string
  overrideModel: string
  plaintextKey?: string
  baseURL?: string
  keyEntryId?: string
  existingKeyEntryId?: string
  headerTemplate?: string
}

export interface AdminRouterOpenAICompatibleSlice {
  kind: 'openai-compatible'
  modelName: string
  overrideModel: string
  plaintextKey?: string
  baseURL?: string
  keyEntryId?: string
  existingKeyEntryId?: string
  headerTemplate?: string
}

export interface AdminRouterAzureSlice {
  kind: 'azure'
  modelName: string
  region: string
  defaultVoice?: string
  plaintextKey?: string
  keyEntryId?: string
  existingKeyEntryId?: string
}

export interface AdminRouterDashscopeSlice {
  kind: 'dashscope-cosyvoice'
  modelName: string
  region: 'intl' | 'cn'
  upstreamModel: string
  plaintextKey?: string
  keyEntryId?: string
  existingKeyEntryId?: string
}

export interface AdminRouterStepfunSlice {
  kind: 'stepfun'
  modelName: string
  upstreamModel?: 'stepaudio-2.5-tts' | 'step-tts-2' | 'step-tts-mini'
  defaultVoice?: string
  instruction?: string
  plaintextKey?: string
  keyEntryId?: string
  existingKeyEntryId?: string
}

export interface AdminRouterUnspeechSlice {
  kind: 'unspeech'
  restBaseURL: string
  streaming?: {
    upstreamURL: string
    plaintextKey?: string
    keyEntryId?: string
    existingKeyEntryId?: string
    models?: Array<{ id: string, name?: string, description?: string }>
    defaultModel?: string
  }
}

export interface AdminRouterAliyunNlsAsrSlice {
  kind: 'aliyun-nls-asr'
  modelName: string
  accessKeyId: string
  appKey: string
  region?: 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'
  plaintextKey?: string
  keyEntryId?: string
  existingKeyEntryId?: string
}

export type AdminRouterConfigSlice
  = | AdminRouterOpenRouterSlice
    | AdminRouterBedrockSlice
    | AdminRouterOpenAICompatibleSlice
    | AdminRouterAzureSlice
    | AdminRouterDashscopeSlice
    | AdminRouterStepfunSlice
    | AdminRouterAliyunNlsAsrSlice
    | AdminRouterUnspeechSlice

export interface AdminRouterConfigRequest {
  mode?: 'merge' | 'reset'
  dryRun?: boolean
  slices?: AdminRouterConfigSlice[]
  defaults?: {
    chatModel?: string
    ttsModel?: string
    ttsVoices?: Record<string, Record<string, string>>
  }
}

export interface AdminRouterConfigResult {
  applied: Array<Record<string, unknown>>
  invalidatedKeys: string[]
  preview: Record<string, unknown>
}

export interface AdminRouterConfigCurrent {
  request: AdminRouterConfigRequest
  preview: Record<string, unknown>
  loadedAt: string
  missingKeys: string[]
}

export interface VoicePackParams {
  pitch?: number
  volume?: number
  rate?: number
}

export interface VoicePack {
  id: string
  name: string
  description: string | null
  provider: string
  model: string
  voiceId: string
  upstreamVoiceId: string
  ttsModelId: string
  params: VoicePackParams
  costMultiplier: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface VoicePackPayload {
  name: string
  description?: string
  provider: string
  model: string
  voiceId: string
  upstreamVoiceId: string
  ttsModelId: string
  params?: VoicePackParams
  costMultiplier: number
  enabled?: boolean
}

export interface SpeechModel {
  id: string
  name: string
}

export interface SpeechModelsResult {
  models: SpeechModel[]
  default: string | null
}

export interface SpeechVoice {
  id: string
  name: string
  description?: string
  labels?: Record<string, unknown>
  tags?: string[]
  languages?: { code: string, title: string }[]
  preview_audio_url?: string
}

export interface SpeechVoicesResult {
  voices: SpeechVoice[]
  recommended: Record<string, string>
}

export interface SpeechTestPayload {
  model: string
  input: string
  voice: string
  speed?: number
  extra_body?: {
    voice_pack?: Record<string, unknown>
  }
}

export type OfficialCatalogSurface = 'llm' | 'asr'
export type OfficialCatalogRoutePool = 'primary' | 'fallback'

export interface OfficialProviderAliasRoute {
  id: string
  aliasId: string
  routerModelId: string
  pool: OfficialCatalogRoutePool
  enabled: boolean
  weight: number
  displayOrder: number
  createdAt: string
  updatedAt: string
}

export interface OfficialProviderAlias {
  id: string
  surface: OfficialCatalogSurface
  aliasId: string
  displayName: string
  enabled: boolean
  displayOrder: number
  fallbackEnabled: boolean
  loadBalancingEnabled: boolean
  routes: OfficialProviderAliasRoute[]
  createdAt: string
  updatedAt: string
}

export interface OfficialTtsModel {
  id: string
  routerModelId: string
  provider: string
  displayName: string
  enabled: boolean
  displayOrder: number
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OfficialTtsVoice {
  id: string
  ttsModelId: string
  providerVoiceId: string
  displayName: string
  enabled: boolean
  displayOrder: number
  languages: Array<{ code: string, title?: string }>
  labels: Record<string, unknown>
  previewAudioUrl: string | null
  source: 'provider-sync' | 'manual'
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export function apiServerUrl(): string {
  return getServerAdminBootstrapContext()?.apiServerUrl ?? defaultApiServerUrl()
}

/**
 * Builds an API-owned sign-in URL that returns to the exact admin page.
 *
 * Use when:
 * - The standalone admin app needs to bounce through the API auth route.
 * - The admin app may be hosted on a different origin than the auth UI.
 *
 * Expects:
 * - `currentUrl` is the browser's absolute admin URL.
 *
 * Returns:
 * - An API `/auth/sign-in` URL carrying an absolute trusted return target.
 */
export function buildAdminSignInUrl(apiServerUrl: string, currentUrl: string): string {
  const url = new URL('/auth/sign-in', apiServerUrl)
  url.searchParams.set('redirect', currentUrl)
  return url.toString()
}

export function signInUrl(): string {
  return buildAdminSignInUrl(apiServerUrl(), window.location.href)
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const endpoint = new URL(`/api/admin${path}`, apiServerUrl())
  return fetchJson<T>(endpoint, init)
}

async function publicFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const endpoint = new URL(`/api/v1${path}`, apiServerUrl())
  return fetchJson<T>(endpoint, init)
}

async function fetchJson<T>(endpoint: URL, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const response = await fetch(endpoint.toString(), {
    ...init,
    headers,
    credentials: 'include',
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  }
  catch {
    const contentType = response.headers.get('Content-Type')
    throw new AdminApiError(
      `Expected JSON from ${endpoint.pathname}, got ${contentType ?? 'an empty response'}. Check api_server_url.`,
      response.status,
      null,
    )
  }

  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? `Admin API request failed (${response.status})`
    throw new AdminApiError(message, response.status, payload)
  }

  return payload as T
}

async function publicFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const endpoint = new URL(`/api/v1${path}`, apiServerUrl())
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const response = await fetch(endpoint.toString(), {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    }
    catch {
      payload = await response.text().catch(() => null)
    }
    const message = extractErrorMessage(payload) ?? `Audio API request failed (${response.status})`
    throw new AdminApiError(message, response.status, payload)
  }

  return await response.blob()
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object')
    return null
  const maybe = payload as { message?: unknown, error?: unknown }
  if (typeof maybe.message === 'string')
    return maybe.message
  if (typeof maybe.error === 'string')
    return maybe.error
  return null
}

export const adminApi = {
  me: () => adminFetch<AdminMe>('/me'),
  metrics: () => adminFetch<AdminMetrics>('/metrics'),
  users: (params: { query?: string, limit?: number, offset?: number, sortDirection?: string, sortKey?: string, status?: string }) => {
    const query = new URLSearchParams()
    if (params.query)
      query.set('query', params.query)
    if (params.limit != null)
      query.set('limit', String(params.limit))
    if (params.offset != null)
      query.set('offset', String(params.offset))
    if (params.sortDirection)
      query.set('sortDirection', params.sortDirection)
    if (params.sortKey)
      query.set('sortKey', params.sortKey)
    if (params.status)
      query.set('status', params.status)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return adminFetch<AdminUsersPage>(`/users${suffix}`)
  },
  user: (id: string) => adminFetch<{ user: AdminUser, recentFluxTransactions: FluxTransaction[] }>(`/users/${encodeURIComponent(id)}`),
  grantUserFlux: (id: string, body: { amount: number, description: string, idempotencyKey?: string }) =>
    adminFetch<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string, idempotent: boolean }>(`/users/${encodeURIComponent(id)}/flux/grant`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setUserFlux: (id: string, body: { balance: number, description: string }) =>
    adminFetch<{ balanceBefore: number, balanceAfter: number, fluxTransactionId: string | null, changed: boolean }>(`/users/${encodeURIComponent(id)}/flux`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  fluxGrantPreview: (body: { amount: number, description: string, emails: string[], idempotencyKey?: string }) =>
    adminFetch<unknown>('/flux-grants?dryRun=true', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  fluxGrant: (body: { amount: number, description: string, emails: string[], idempotencyKey?: string }) =>
    adminFetch<unknown>('/flux-grants', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  applyRouterConfig: (body: AdminRouterConfigRequest, dryRun: boolean) =>
    adminFetch<AdminRouterConfigResult>('/config/router', {
      method: 'POST',
      body: JSON.stringify({ ...body, dryRun }),
    }),
  routerConfig: () => adminFetch<AdminRouterConfigCurrent>('/config/router'),
  speechModels: async (): Promise<SpeechModelsResult> => {
    const data = await publicFetch<{ default?: unknown, models?: SpeechModel[] }>('/audio/models')
    return {
      models: Array.isArray(data.models) ? data.models : [],
      default: typeof data.default === 'string' ? data.default : null,
    }
  },
  speechVoices: async (model: string): Promise<SpeechVoicesResult> => {
    const query = new URLSearchParams()
    query.set('model', model)
    const data = await publicFetch<Partial<SpeechVoicesResult>>(`/audio/voices?${query.toString()}`)
    return {
      voices: Array.isArray(data.voices) ? data.voices : [],
      recommended: data.recommended && typeof data.recommended === 'object' ? data.recommended : {},
    }
  },
  testSpeech: (body: SpeechTestPayload) =>
    publicFetchBlob('/audio/speech', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  voicePacks: () => adminFetch<VoicePack[]>('/voice-packs'),
  createVoicePack: (body: VoicePackPayload) =>
    adminFetch<VoicePack>('/voice-packs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateVoicePack: (id: string, body: Partial<VoicePackPayload>) =>
    adminFetch<VoicePack>(`/voice-packs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  disableVoicePack: (id: string) =>
    adminFetch<VoicePack>(`/voice-packs/${encodeURIComponent(id)}/disable`, {
      method: 'POST',
    }),
  officialAliases: (surface?: OfficialCatalogSurface) => {
    const suffix = surface ? `?surface=${encodeURIComponent(surface)}` : ''
    return adminFetch<OfficialProviderAlias[]>(`/official-catalog/aliases${suffix}`)
  },
  syncOfficialAliases: (surface: OfficialCatalogSurface) =>
    adminFetch<{ aliases: OfficialProviderAlias[] }>('/official-catalog/aliases/sync', {
      method: 'POST',
      body: JSON.stringify({ surface }),
    }),
  updateOfficialAlias: (id: string, body: Partial<Pick<OfficialProviderAlias, 'displayName' | 'enabled' | 'displayOrder' | 'fallbackEnabled' | 'loadBalancingEnabled'>>) =>
    adminFetch<OfficialProviderAlias>(`/official-catalog/aliases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  updateOfficialAliasRoute: (id: string, body: Partial<Pick<OfficialProviderAliasRoute, 'enabled' | 'pool' | 'weight' | 'displayOrder'>>) =>
    adminFetch<OfficialProviderAliasRoute>(`/official-catalog/alias-routes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  officialTtsModels: () => adminFetch<OfficialTtsModel[]>('/official-catalog/tts/models'),
  syncOfficialTtsModels: () =>
    adminFetch<{ models: OfficialTtsModel[] }>('/official-catalog/tts/models/sync', {
      method: 'POST',
    }),
  updateOfficialTtsModel: (id: string, body: Partial<Pick<OfficialTtsModel, 'displayName' | 'enabled' | 'displayOrder'>>) =>
    adminFetch<OfficialTtsModel>(`/official-catalog/tts/models/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  officialTtsVoices: (model: string) => {
    const query = new URLSearchParams({ model })
    return adminFetch<OfficialTtsVoice[]>(`/official-catalog/tts/voices?${query.toString()}`)
  },
  syncOfficialTtsVoices: (routerModelId: string) =>
    adminFetch<{ voices: OfficialTtsVoice[], syncedCount: number }>('/official-catalog/tts/voices/sync', {
      method: 'POST',
      body: JSON.stringify({ routerModelId }),
    }),
  updateOfficialTtsVoice: (id: string, body: Partial<Pick<OfficialTtsVoice, 'displayName' | 'enabled' | 'displayOrder' | 'languages' | 'labels' | 'previewAudioUrl'>>) =>
    adminFetch<OfficialTtsVoice>(`/official-catalog/tts/voices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
}
