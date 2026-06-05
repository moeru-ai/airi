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

export interface AdminRouterConfigRequest {
  mode?: 'merge' | 'reset'
  dryRun?: boolean
  slices?: Array<Record<string, unknown>>
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

export interface VoicePackParams {
  [key: string]: string | number | boolean | null
}

export interface VoicePack {
  id: string
  name: string
  description: string | null
  provider: string
  model: string
  voiceId: string
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
  ttsModelId: string
  params?: VoicePackParams
  costMultiplier: number
  enabled?: boolean
}

export interface SpeechModel {
  id: string
  name: string
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

export function signInUrl(): string {
  const url = new URL('/auth/sign-in', apiServerUrl())
  url.searchParams.set('redirect', `${window.location.pathname}${window.location.search}`)
  return url.toString()
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
    payload = null
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
  speechModels: async () => {
    const data = await publicFetch<{ models?: SpeechModel[] }>('/audio/models')
    return Array.isArray(data.models) ? data.models : []
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
}
