import type { ModelInfo } from '../../types'

const TRAILING_SLASH_PATTERN = /\/+$/

export type OpenClawSessionStrategy = 'auto' | 'manual'
export type OpenClawApiMode = 'chat_completions' | 'responses'

export interface OpenClawProviderConfigLike {
  agentId?: string
  apiKey?: string
  apiMode?: OpenClawApiMode
  baseUrl?: string
  sessionKey?: string
  sessionStrategy?: OpenClawSessionStrategy
  underlyingModel?: string
}

export interface OpenClawSessionHeaderOptions {
  activeSessionId?: string
  fallbackSessionId?: string
  sessionKey?: string
  sessionStrategy?: OpenClawSessionStrategy
}

interface OpenClawModelsResponse {
  data?: Array<{
    id?: string
    name?: string
    description?: string
    context_length?: number
  }>
}

export function resolveOpenClawApiBaseUrl(baseUrl?: string): string {
  const trimmed = (baseUrl || 'http://localhost:18789').trim() || 'http://localhost:18789'
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

export function resolveOpenClawAgentId(agentId?: string): string {
  return (agentId || 'default').trim() || 'default'
}

export function normalizeOpenClawTarget(model: unknown, fallbackAgentId?: string): string {
  const raw = typeof model === 'string' ? model.trim() : ''
  const agentId = resolveOpenClawAgentId(fallbackAgentId)

  if (!raw) {
    return `openclaw/${agentId}`
  }

  if (raw === 'openclaw' || raw === 'openclaw/default') {
    return raw
  }

  if (raw.startsWith('openclaw/')) {
    return raw
  }

  if (raw.startsWith('openclaw:')) {
    return `openclaw/${raw.slice('openclaw:'.length).trim()}`
  }

  if (raw.startsWith('agent:')) {
    return `openclaw/${raw.slice('agent:'.length).trim()}`
  }

  return `openclaw/${raw}`
}

export function buildOpenClawSessionHeaders(options: OpenClawSessionHeaderOptions): Record<string, string> {
  const strategy = options.sessionStrategy ?? 'auto'
  const derivedSessionId = (options.activeSessionId || options.fallbackSessionId || '').trim()
  const manualSessionKey = (options.sessionKey || '').trim()

  const continuityValue = strategy === 'manual'
    ? manualSessionKey
    : derivedSessionId

  if (!continuityValue) {
    return {}
  }

  return {
    'x-openclaw-session-key': continuityValue,
  }
}

export function formatOpenClawModelName(target: string): string {
  if (target === 'openclaw') {
    return 'OpenClaw'
  }

  if (target === 'openclaw/default') {
    return 'Default Agent'
  }

  if (target.startsWith('openclaw/')) {
    return target.slice('openclaw/'.length)
  }

  return target
}

export function formatOpenClawModelDescription(target: string, description?: string): string {
  const normalized = (description || '').trim()
  if (normalized) {
    return normalized
  }

  return target === 'openclaw/default'
    ? 'OpenClaw agent target (default agent)'
    : 'OpenClaw agent target'
}

export function mapOpenClawModels(providerId: string, payload: unknown): ModelInfo[] {
  const response = payload as OpenClawModelsResponse
  const models = response?.data ?? []

  return models
    .map((model) => {
      const id = normalizeOpenClawTarget(model.id, 'default')
      return {
        id,
        name: formatOpenClawModelName(id),
        provider: providerId,
        description: formatOpenClawModelDescription(id, model.description),
        contextLength: model.context_length,
        deprecated: false,
      } satisfies ModelInfo
    })
    .filter(model => !!model.id)
}

export function isOpenClawModelTarget(model: string): boolean {
  return model === 'openclaw' || model.startsWith('openclaw/')
}

export function buildOpenClawValidationTarget(config: OpenClawProviderConfigLike): string {
  return normalizeOpenClawTarget(config.agentId || 'default', config.agentId || 'default')
}
