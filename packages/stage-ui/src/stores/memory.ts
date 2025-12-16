import type { Message as ChatMessage } from '@xsai/shared-chat'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface MemoryMessage {
  role: string
  content: string | unknown
  timestamp: Date
  metadata?: Record<string, unknown>
}

export type ShortTermProviderType = 'vercel-kv' | 'upstash-redis' | 'local-redis'
export type EmbeddingProviderType = 'openai' | 'openai-compatible' | 'cloudflare'

interface MemoryConfigurationPayload {
  shortTerm: {
    provider: ShortTermProviderType
    namespace?: string
    maxMessages?: number
    ttlSeconds?: number
    upstash?: {
      url: string
      token: string
    }
    redis?: {
      host?: string
      port?: number
      password?: string
    }
  }
  longTerm?: {
    enabled: boolean
    provider: 'postgres-pgvector' | 'qdrant'
    postgres?: {
      connectionString?: string
      host?: string
      port?: number
      database?: string
      user?: string
      password?: string
      ssl?: boolean
      tableName?: string
    }
    qdrant?: {
      url?: string
      apiKey?: string
      collectionName?: string
      vectorSize?: number
    }
    embedding?: {
      provider: EmbeddingProviderType
      model: string
      apiKey?: string
      baseUrl?: string
      accountId?: string
      apiToken?: string
      openai?: {
        apiKey: string
        baseURL?: string
      }
      cloudflare?: {
        accountId: string
        apiToken: string
        model?: string
      }
    }
  }
}

type EmbeddingConfigurationPayloadType = NonNullable<MemoryConfigurationPayload['longTerm']>['embedding']

function resolveEnvValue(key: string): string | boolean | undefined {
  const env = (import.meta?.env ?? {}) as Record<string, string | boolean | undefined>
  const variants = [key, `VITE_${key}`, `PUBLIC_${key}`, `NEXT_PUBLIC_${key}`]

  for (const name of variants) {
    const value = env[name]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    for (const name of variants) {
      const value = process.env[name]
      if (value !== undefined && value !== null && value !== '') {
        return value
      }
    }
  }

  return undefined
}

function getEnvValue(key: string, defaultValue: string | number | boolean): string | number | boolean {
  const resolved = resolveEnvValue(key)
  if (resolved === undefined) {
    return defaultValue
  }

  if (typeof defaultValue === 'number') {
    const parsed = Number.parseInt(String(resolved), 10)
    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  if (typeof defaultValue === 'boolean') {
    if (typeof resolved === 'boolean') {
      return resolved
    }
    const normalized = String(resolved).toLowerCase()
    return normalized === 'true' || normalized === '1'
  }

  return String(resolved)
}

export const useMemoryStore = defineStore('memory', () => {
  const enabledShortTerm = useLocalStorage('settings/memory/short-term/enabled', true)
  const enabledLongTerm = useLocalStorage('settings/memory/long-term/enabled', getEnvValue('LONG_TERM_MEMORY_ENABLED', getEnvValue('MEMORY_LONG_TERM_ENABLED', false) as boolean) as boolean)
  const retentionLimit = useLocalStorage('settings/memory/short-term/limit', getEnvValue('SHORT_TERM_MEMORY_MAX_MESSAGES', 20) as number)
  const envShortTermProvider = getEnvValue('SHORT_TERM_MEMORY_PROVIDER', getEnvValue('MEMORY_PROVIDER', '') as string) as string
  const detectedUpstashUrlValue = getEnvValue(
    'UPSTASH_KV_REST_API_URL',
    getEnvValue('UPSTASH_KV_URL', getEnvValue('UPSTASH_REDIS_REST_URL', '') as string) as string,
  )
  const detectedUpstashUrl = typeof detectedUpstashUrlValue === 'string' ? detectedUpstashUrlValue : ''
  const vercelEnv = resolveEnvValue('VERCEL')
  const runningOnVercel = (() => {
    if (typeof vercelEnv === 'boolean') {
      return vercelEnv
    }
    if (typeof vercelEnv === 'string') {
      return vercelEnv === '1' || vercelEnv.toLowerCase() === 'true'
    }
    if (typeof process !== 'undefined' && typeof process.env?.VERCEL === 'string') {
      const value = process.env.VERCEL
      return value === '1' || value?.toLowerCase() === 'true'
    }
    return false
  })()

  const defaultShortTermProvider: ShortTermProviderType = (() => {
    const normalized = (envShortTermProvider || '').toLowerCase()
    if (normalized === 'vercel-kv' || normalized === 'upstash-redis' || normalized === 'local-redis') {
      return normalized as ShortTermProviderType
    }
    if (detectedUpstashUrl) {
      return 'upstash-redis'
    }
    if (runningOnVercel) {
      return 'vercel-kv'
    }
    return 'local-redis'
  })()

  const shortTermProvider = useLocalStorage<ShortTermProviderType>('settings/memory/short-term/provider', defaultShortTermProvider)
  const shortTermNamespace = useLocalStorage('settings/memory/short-term/namespace', getEnvValue('MEMORY_NAMESPACE', 'memory') as string)
  const shortTermTtl = useLocalStorage('settings/memory/short-term/ttl', getEnvValue('SHORT_TERM_MEMORY_TTL_SECONDS', 60 * 30) as number)
  const shortTermUpstashUrl = useLocalStorage('settings/memory/short-term/upstash-url', detectedUpstashUrl)
  const shortTermUpstashToken = useLocalStorage(
    'settings/memory/short-term/upstash-token',
    getEnvValue('UPSTASH_KV_REST_API_TOKEN', getEnvValue('UPSTASH_REDIS_REST_TOKEN', '') as string) as string,
  )
  const shortTermRedisHost = useLocalStorage('settings/memory/short-term/redis-host', 'localhost')
  const shortTermRedisPort = useLocalStorage('settings/memory/short-term/redis-port', 6379)
  const shortTermRedisPassword = useLocalStorage('settings/memory/short-term/redis-password', '')

  // Allow local-redis in non-Vercel deployments unless explicit provider overrides it

  const autoPromoteAssistant = useLocalStorage('settings/memory/long-term/promote-assistant', true)
  const autoPromoteUser = useLocalStorage('settings/memory/long-term/promote-user', true)
  const longTermProvider = useLocalStorage('settings/memory/long-term/provider', getEnvValue('LONG_TERM_MEMORY_PROVIDER', getEnvValue('MEMORY_LONG_TERM_PROVIDER', 'postgres-pgvector') as string) as string)
  const longTermConnectionString = useLocalStorage('settings/memory/long-term/connection-string', getEnvValue('MEMORY_LONG_TERM_CONNECTION_STRING', getEnvValue('POSTGRES_URL', getEnvValue('DATABASE_URL', '') as string) as string) as string)
  const longTermHost = useLocalStorage('settings/memory/long-term/host', getEnvValue('POSTGRES_HOST', '') as string)
  const longTermPort = useLocalStorage('settings/memory/long-term/port', getEnvValue('POSTGRES_PORT', 5432) as number)
  const longTermDatabase = useLocalStorage('settings/memory/long-term/database', getEnvValue('POSTGRES_DATABASE', getEnvValue('POSTGRES_DB', 'postgres') as string) as string)
  const longTermUser = useLocalStorage('settings/memory/long-term/user', getEnvValue('POSTGRES_USER', 'postgres') as string)
  const longTermPassword = useLocalStorage('settings/memory/long-term/password', getEnvValue('POSTGRES_PASSWORD', '') as string)
  const longTermSsl = useLocalStorage('settings/memory/long-term/ssl', getEnvValue('POSTGRES_SSL', false) as boolean)

  const longTermQdrantUrl = useLocalStorage('settings/memory/long-term/qdrant/url', getEnvValue('QDRANT_URL', 'http://localhost:6333') as string)
  const longTermQdrantApiKey = useLocalStorage('settings/memory/long-term/qdrant/api-key', getEnvValue('QDRANT_API_KEY', '') as string)
  const longTermQdrantCollection = useLocalStorage('settings/memory/long-term/qdrant/collection', getEnvValue('QDRANT_COLLECTION_NAME', 'memory_entries') as string)
  const longTermQdrantVectorSize = useLocalStorage('settings/memory/long-term/qdrant/vector-size', getEnvValue('QDRANT_VECTOR_SIZE', 1536) as number)

  const embeddingProvider = useLocalStorage<EmbeddingProviderType>('settings/memory/embedding/provider', getEnvValue('MEMORY_EMBEDDING_PROVIDER', getEnvValue('EMBEDDING_PROVIDER', 'openai') as string) as EmbeddingProviderType)
  const embeddingApiKey = useLocalStorage('settings/memory/embedding/api-key', getEnvValue('MEMORY_EMBEDDING_API_KEY', getEnvValue('OPENAI_API_KEY', '') as string) as string)
  const embeddingBaseUrl = useLocalStorage('settings/memory/embedding/base-url', getEnvValue('MEMORY_EMBEDDING_BASE_URL', getEnvValue('OPENAI_BASE_URL', '') as string) as string)
  const embeddingAccountId = useLocalStorage('settings/memory/embedding/account-id', getEnvValue('CLOUDFLARE_ACCOUNT_ID', '') as string)
  const embeddingApiToken = useLocalStorage('settings/memory/embedding/api-token', getEnvValue('CLOUDFLARE_API_TOKEN', '') as string)
  const embeddingModel = useLocalStorage('settings/memory/embedding/model', getEnvValue('MEMORY_EMBEDDING_MODEL', getEnvValue('EMBEDDING_MODEL', 'text-embedding-3-small') as string) as string)

  const userId = useLocalStorage('settings/memory/user-id', 'default-user')
  const sessionId = useLocalStorage('settings/memory/session-id', crypto.randomUUID())

  const recentMessages = ref<MemoryMessage[]>([])
  const relatedMemories = ref<MemoryMessage[]>([])
  const configurationLoading = ref(false)
  const configurationSaving = ref(false)
  const configurationSaveState = ref<'idle' | 'saved' | 'error'>('idle')
  const configurationError = ref<string | null>(null)

  const shortTermEnabled = computed(() => enabledShortTerm.value)
  const longTermEnabled = computed(() => enabledLongTerm.value)

  // Configuration status detection
  const shortTermConfigured = computed(() => {
    if (shortTermProvider.value === 'vercel-kv') {
      // Vercel KV is usually pre-configured via environment variables
      return true
    }
    if (shortTermProvider.value === 'upstash-redis') {
      return !!(shortTermUpstashUrl.value && shortTermUpstashToken.value)
    }
    if (shortTermProvider.value === 'local-redis') {
      return !!shortTermRedisHost.value
    }
    return false
  })

  const longTermConfigured = computed(() => {
    if (!enabledLongTerm.value) {
      return false
    }

    // Check database configuration
    let databaseConfigured = false
    if (longTermProvider.value === 'postgres-pgvector') {
      databaseConfigured = !!(longTermConnectionString.value || (longTermHost.value && longTermDatabase.value))
    }
    else if (longTermProvider.value === 'qdrant') {
      databaseConfigured = !!longTermQdrantUrl.value
    }

    if (!databaseConfigured) {
      return false
    }

    // Check embedding configuration
    if (embeddingProvider.value === 'openai' || embeddingProvider.value === 'openai-compatible') {
      return !!(embeddingApiKey.value && embeddingModel.value)
    }
    if (embeddingProvider.value === 'cloudflare') {
      return !!(embeddingAccountId.value && embeddingApiToken.value)
    }

    return false
  })

  function regenerateSession() {
    sessionId.value = crypto.randomUUID()
  }

  async function fetchRecent(limit?: number) {
    if (!shortTermEnabled.value) {
      recentMessages.value = []
      return []
    }

    const response = await fetch(`/api/memory/session/${encodeURIComponent(sessionId.value)}${limit ? `?limit=${limit}` : ''}`)
    if (!response.ok) {
      return []
    }

    const data = await response.json() as { success: boolean, data?: Array<{ role: string, content: unknown, timestamp: string | Date, metadata?: Record<string, unknown> }> }
    if (!data.success || !Array.isArray(data.data)) {
      return []
    }

    recentMessages.value = data.data.map(normalizeMessage)
    return recentMessages.value
  }

  async function saveMessage(message: MemoryMessage) {
    if (!shortTermEnabled.value) {
      return
    }

    const payload = {
      sessionId: sessionId.value,
      userId: userId.value,
      message: normalizeMessage({
        ...message,
        timestamp: message.timestamp ?? new Date(),
        metadata: {
          ...(message.metadata ?? {}),
          persistLongTerm: longTermEnabled.value && shouldPromote(message),
        },
      }),
    }

    await fetch('/api/memory/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  async function searchMemories(query: string, limit?: number) {
    if (!longTermEnabled.value) {
      relatedMemories.value = []
      return []
    }

    const response = await fetch('/api/memory/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, userId: userId.value, limit }),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json() as { success: boolean, data?: Array<{ id: string, content: string, score: number, metadata?: Record<string, unknown>, timestamp: string }> }
    if (!data.success || !Array.isArray(data.data)) {
      return []
    }

    relatedMemories.value = data.data.map(item => normalizeMessage({
      role: item.metadata?.role as string || 'user',
      content: item.content,
      timestamp: item.timestamp,
      metadata: item.metadata,
    }))
    return relatedMemories.value
  }

  async function clearSession() {
    await fetch('/api/memory/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId: sessionId.value }),
    })

    recentMessages.value = []
  }

  async function exportMemories(limit = 200) {
    if (!longTermEnabled.value) {
      return []
    }

    const response = await fetch(`/api/memory/export?userId=${encodeURIComponent(userId.value)}&limit=${limit}`)
    if (!response.ok) {
      return []
    }

    const data = await response.json() as { success: boolean, data?: Array<{ id: string, content: string, score: number, metadata?: Record<string, unknown>, timestamp: string }> }
    if (!data.success || !Array.isArray(data.data)) {
      return []
    }

    return data.data.map(item => normalizeMessage({
      role: item.metadata?.role as string || 'user',
      content: item.content,
      timestamp: item.timestamp,
      metadata: item.metadata,
    }))
  }

  function shouldPromote(message: MemoryMessage) {
    if (message.role === 'assistant') {
      return autoPromoteAssistant.value
    }

    if (message.role === 'user') {
      return autoPromoteUser.value
    }

    return false
  }

  function normalizeMessage(message: MemoryMessage | { role: string, content: unknown, timestamp: Date | string, metadata?: Record<string, unknown> }): MemoryMessage {
    return {
      ...message,
      timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
    }
  }

  function appendContextMessages(target: ChatMessage[]) {
    if (!shortTermEnabled.value || !target.length) {
      return target
    }

    const limited = recentMessages.value.slice(-retentionLimit.value).map(msg => ({
      role: msg.role,
      content: msg.content,
    }))

    if (!limited.length) {
      return target
    }

    const contextMessage: ChatMessage = {
      role: 'system',
      content: `Relevant short-term memory:\n${limited.map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`).join('\n')}`,
    }

    return [target[0], contextMessage, ...target.slice(1)]
  }

  async function loadConfiguration() {
    // Skip API call for static deployments (no backend)
    // Configuration is already initialized from environment variables
    configurationLoading.value = true
    configurationError.value = null

    try {
      const response = await fetch('/api/memory/config')
      if (!response.ok) {
        // Silently skip for static deployments (404 is expected)
        if (response.status === 404) {
          return
        }
        throw new Error(`Failed to load configuration: ${response.status}`)
      }

      const data = await response.json() as { success: boolean, data?: MemoryConfigurationPayload }
      if (!data.success || !data.data) {
        throw new Error('Invalid configuration response')
      }

      const { shortTerm, longTerm } = data.data
      if (shortTerm) {
        shortTermProvider.value = shortTerm.provider ?? 'local-redis'
        shortTermNamespace.value = shortTerm.namespace ?? 'memory'
        if (typeof shortTerm.maxMessages === 'number') {
          retentionLimit.value = shortTerm.maxMessages
        }
        if (typeof shortTerm.ttlSeconds === 'number') {
          shortTermTtl.value = shortTerm.ttlSeconds
        }
        if (shortTerm.upstash) {
          shortTermUpstashUrl.value = shortTerm.upstash.url ?? ''
          shortTermUpstashToken.value = shortTerm.upstash.token ?? ''
        }
        if (shortTerm.redis) {
          shortTermRedisHost.value = shortTerm.redis.host ?? 'localhost'
          if (typeof shortTerm.redis.port === 'number') {
            shortTermRedisPort.value = shortTerm.redis.port
          }
          shortTermRedisPassword.value = shortTerm.redis.password ?? ''
        }
      }

      if (longTerm) {
        enabledLongTerm.value = longTerm.enabled ?? false
        longTermProvider.value = longTerm.provider

        if (longTerm.provider === 'postgres-pgvector') {
          const postgres = longTerm.postgres ?? (longTerm as Record<string, any>).connection ?? {}
          longTermConnectionString.value = postgres.connectionString ?? ''
          longTermHost.value = postgres.host ?? ''
          if (typeof postgres.port === 'number') {
            longTermPort.value = postgres.port
          }
          longTermDatabase.value = postgres.database ?? 'postgres'
          longTermUser.value = postgres.user ?? 'postgres'
          longTermPassword.value = postgres.password ?? ''
          if (typeof postgres.ssl === 'boolean') {
            longTermSsl.value = postgres.ssl
          }
        }
        else if (longTerm.provider === 'qdrant') {
          const qdrant = longTerm.qdrant ?? { url: '', collectionName: 'memory_entries' }
          longTermQdrantUrl.value = qdrant.url ?? ''
          longTermQdrantApiKey.value = qdrant.apiKey ?? ''
          longTermQdrantCollection.value = qdrant.collectionName ?? 'memory_entries'
          if (typeof qdrant.vectorSize === 'number') {
            longTermQdrantVectorSize.value = qdrant.vectorSize
          }
        }

        if (longTerm.embedding) {
          const embedding = longTerm.embedding
          embeddingProvider.value = embedding.provider ?? 'openai'
          embeddingModel.value = embedding.model ?? 'text-embedding-3-small'

          if (embeddingProvider.value === 'cloudflare') {
            const cloudflare = embedding.cloudflare ?? {
              accountId: embedding.accountId,
              apiToken: embedding.apiToken,
              model: embedding.model,
            }
            embeddingAccountId.value = cloudflare?.accountId ?? embedding.accountId ?? ''
            embeddingApiToken.value = cloudflare?.apiToken ?? embedding.apiToken ?? ''
            embeddingApiKey.value = ''
            embeddingBaseUrl.value = ''
          }
          else {
            const openai = embedding.openai ?? {
              apiKey: embedding.apiKey,
              baseURL: embedding.baseUrl ?? (embedding as Record<string, unknown>).baseURL,
            }
            embeddingApiKey.value = openai?.apiKey ?? embedding.apiKey ?? ''
            embeddingBaseUrl.value = openai?.baseURL ?? embedding.baseUrl ?? ''
            embeddingAccountId.value = embedding.accountId ?? ''
            embeddingApiToken.value = embedding.apiToken ?? ''
          }
        }
      }
    }
    catch (error) {
      // Only set error for non-404 errors
      if (error instanceof Error && !error.message.includes('404')) {
        configurationError.value = error.message
      }
    }
    finally {
      configurationLoading.value = false
    }
  }

  async function applyConfiguration() {
    configurationSaving.value = true
    configurationError.value = null
    configurationSaveState.value = 'idle'

    try {
      const safeLimit = retentionLimit.value > 0 ? retentionLimit.value : 20
      const safeTtl = shortTermTtl.value > 0 ? shortTermTtl.value : 60 * 30

      const payload: MemoryConfigurationPayload = {
        shortTerm: {
          provider: shortTermProvider.value,
          namespace: shortTermNamespace.value,
          maxMessages: safeLimit,
          ttlSeconds: safeTtl,
          upstash: shortTermProvider.value === 'upstash-redis'
            ? {
                url: shortTermUpstashUrl.value,
                token: shortTermUpstashToken.value,
              }
            : undefined,
          redis: shortTermProvider.value === 'local-redis'
            ? {
                host: shortTermRedisHost.value,
                port: Number(shortTermRedisPort.value) || 6379,
                password: shortTermRedisPassword.value || undefined,
              }
            : undefined,
        },
        longTerm: (() => {
          const embeddingPayload = {
            provider: embeddingProvider.value,
            model: embeddingModel.value,
            apiKey: embeddingApiKey.value || undefined,
            baseUrl: embeddingBaseUrl.value || undefined,
            accountId: embeddingAccountId.value || undefined,
            apiToken: embeddingApiToken.value || undefined,
          } as EmbeddingConfigurationPayloadType

          if (embeddingProvider.value === 'cloudflare') {
            embeddingPayload.apiKey = undefined
            embeddingPayload.baseUrl = undefined
            embeddingPayload.cloudflare = {
              accountId: embeddingAccountId.value,
              apiToken: embeddingApiToken.value,
              model: embeddingModel.value || undefined,
            }
            embeddingPayload.openai = undefined
          }
          else {
            embeddingPayload.openai = {
              apiKey: embeddingApiKey.value,
              baseURL: embeddingBaseUrl.value || undefined,
            }
            embeddingPayload.cloudflare = undefined
            embeddingPayload.apiToken = undefined
          }

          const postgresConfig = {
            connectionString: longTermConnectionString.value || undefined,
            host: longTermHost.value || undefined,
            port: Number(longTermPort.value) || undefined,
            database: longTermDatabase.value || undefined,
            user: longTermUser.value || undefined,
            password: longTermPassword.value || undefined,
            ssl: longTermSsl.value,
          }

          const parsedVectorSize = Number(longTermQdrantVectorSize.value)
          const qdrantConfig = {
            url: longTermQdrantUrl.value || undefined,
            apiKey: longTermQdrantApiKey.value || undefined,
            collectionName: longTermQdrantCollection.value || 'memory_entries',
            vectorSize: Number.isNaN(parsedVectorSize) ? undefined : parsedVectorSize,
          }

          if (longTermProvider.value === 'qdrant') {
            return {
              enabled: enabledLongTerm.value,
              provider: 'qdrant' as const,
              qdrant: qdrantConfig,
              embedding: embeddingPayload,
            }
          }

          return {
            enabled: enabledLongTerm.value,
            provider: 'postgres-pgvector' as const,
            postgres: postgresConfig,
            embedding: embeddingPayload,
          }
        })(),
      }

      const response = await fetch('/api/memory/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      // For static deployments (no backend), saving to localStorage is enough
      if (response.status === 404) {
        configurationSaveState.value = 'saved'
        // Settings are already saved to localStorage via reactive refs
        return
      }

      const data = await response.json().catch(() => ({ success: response.ok }))
      if (!response.ok || !data.success) {
        throw new Error(data?.error ?? `Failed to apply configuration: ${response.status}`)
      }

      configurationSaveState.value = 'saved'
      await loadConfiguration()
    }
    catch (error) {
      configurationSaveState.value = 'error'
      configurationError.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      configurationSaving.value = false
      if (configurationSaveState.value === 'saved') {
        setTimeout(() => {
          configurationSaveState.value = 'idle'
        }, 3000)
      }
    }
  }

  void loadConfiguration()

  return {
    enabledShortTerm,
    enabledLongTerm,
    shortTermEnabled,
    longTermEnabled,
    shortTermConfigured,
    longTermConfigured,
    sessionId,
    userId,
    recentMessages,
    relatedMemories,
    retentionLimit,
    autoPromoteAssistant,
    autoPromoteUser,
    shortTermProvider,
    shortTermNamespace,
    shortTermTtl,
    shortTermUpstashUrl,
    shortTermUpstashToken,
    shortTermRedisHost,
    shortTermRedisPort,
    shortTermRedisPassword,
    longTermProvider,
    longTermConnectionString,
    longTermHost,
    longTermPort,
    longTermDatabase,
    longTermUser,
    longTermPassword,
    longTermSsl,
    longTermQdrantUrl,
    longTermQdrantApiKey,
    longTermQdrantCollection,
    longTermQdrantVectorSize,
    embeddingProvider,
    embeddingApiKey,
    embeddingBaseUrl,
    embeddingAccountId,
    embeddingApiToken,
    embeddingModel,
    configurationLoading,
    configurationSaving,
    configurationSaveState,
    configurationError,

    regenerateSession,
    fetchRecent,
    saveMessage,
    searchMemories,
    clearSession,
    exportMemories,
    appendContextMessages,
    loadConfiguration,
    applyConfiguration,
  }
})
