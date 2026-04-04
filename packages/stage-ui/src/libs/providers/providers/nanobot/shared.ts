import type { ModelInfo } from '../../types'

const TRAILING_SLASH_PATTERN = /\/+$/

export type NanobotSessionIdStrategy = 'auto' | 'manual'

export interface NanobotProviderConfigLike {
  apiKey?: string
  baseUrl?: string
  model?: string
  sessionId?: string
  sessionIdStrategy?: NanobotSessionIdStrategy
}

export interface NanobotSessionIdOptions {
  fallbackSessionId?: string
  platform?: string
  sessionId?: string
  sessionIdStrategy?: NanobotSessionIdStrategy
}

export function resolveNanobotApiBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'http://127.0.0.1:8900/v1').trim() || 'http://127.0.0.1:8900/v1'
  const url = new URL(trimmed)
  const path = url.pathname.replace(TRAILING_SLASH_PATTERN, '')

  if (!path || path === '') {
    url.pathname = '/v1'
  }
  else if (!path.endsWith('/v1')) {
    url.pathname = `${path}/v1`
  }
  else {
    url.pathname = path
  }

  return url.toString().replace(TRAILING_SLASH_PATTERN, '')
}

export function resolveNanobotHealthUrl(baseUrl?: string): string {
  const apiBaseUrl = new URL(resolveNanobotApiBaseUrl(baseUrl))
  apiBaseUrl.pathname = apiBaseUrl.pathname.replace(/\/v1$/, '/health')
  return apiBaseUrl.toString()
}

export function resolveNanobotModel(model?: string): string {
  return (model || '').trim()
}

export function buildNanobotSessionId(options: NanobotSessionIdOptions): string {
  const strategy = options.sessionIdStrategy ?? 'auto'
  const manualSessionId = (options.sessionId || '').trim()
  const fallbackSessionId = (options.fallbackSessionId || '').trim()
  const platform = (options.platform || 'chat').trim() || 'chat'

  if (strategy === 'manual' && manualSessionId) {
    return manualSessionId
  }

  if (!fallbackSessionId) {
    return `airi:${platform}:default`
  }

  return `airi:${platform}:${fallbackSessionId}`
}

export function mapNanobotConfiguredModel(providerId: string, model: string): ModelInfo[] {
  const resolvedModel = resolveNanobotModel(model)
  if (!resolvedModel) {
    return []
  }

  return [{
    id: resolvedModel,
    name: resolvedModel,
    provider: providerId,
    description: 'Configured Nanobot model',
    deprecated: false,
  }]
}
