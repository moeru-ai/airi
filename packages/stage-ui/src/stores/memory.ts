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
    provider: 'postgres-pgvector'
    connection: {
      connectionString?: string
      host?: string
      port?: number
      database?: string
      user?: string
      password?: string
      ssl?: boolean
    }
    embedding?: {
      provider: EmbeddingProviderType
      apiKey: string
      model: string
      baseUrl?: string
      accountId?: string
    }
  }
}

// Helper function to get env value
function getEnvValue(key: string, defaultValue: string | number | boolean): string | number | boolean {
  const value = import.meta.env[key]
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }
  // If defaultValue is a number, try to parse the env value
  if (typeof defaultValue === 'number') {
    const parsed = Number.parseInt(String(value), 10)
    return Number.isNaN(parsed) ? defaultValue : parsed
  }
  // If defaultValue is a boolean, convert the env value
  if (typeof defaultValue === 'boolean') {
    return value === 'true' || value === '1'
  }
  return String(value)
}

export const useMemoryStore = defineStore('memory', () => {
  const enabledShortTerm = useLocalStorage('settings/memory/short-term/enabled', true)
  const enabledLongTerm = useLocalStorage('settings/memory/long-term/enabled', false)
  const retentionLimit = useLocalStorage('settings/memory/short-term/limit', getEnvValue('SHORT_TERM_MEMORY_MAX_MESSAGES', 20) as number)
  const shortTermProvider = useLocalStorage<ShortTermProviderType>('settings/memory/short-term/provider', getEnvValue('SHORT_TERM_MEMORY_PROVIDER', getEnvValue('MEMORY_PROVIDER', 'local-redis') as string) as ShortTermProviderType)
  const shortTermNamespace = useLocalStorage('settings/memory/short-term/namespace', getEnvValue('MEMORY_NAMESPACE', 'memory') as string)
  const shortTermTtl = useLocalStorage('settings/memory/short-term/ttl', getEnvValue('SHORT_TERM_MEMORY_TTL_SECONDS', 60 * 30) as number)
  const shortTermUpstashUrl = useLocalStorage('settings/memory/short-term/upstash-url', '')
  const shortTermUpstashToken = useLocalStorage('settings/memory/short-term/upstash-token', '')
  const shortTermRedisHost = useLocalStorage('settings/memory/short-term/redis-host', 'localhost')
  const shortTermRedisPort = useLocalStorage('settings/memory/short-term/redis-port', 6379)
  const shortTermRedisPassword = useLocalStorage('settings/memory/short-term/redis-password', '')

  const autoPromoteAssistant = useLocalStorage('settings/memory/long-term/promote-assistant', true)
  const autoPromoteUser = useLocalStorage('settings/memory/long-term/promote-user', true)
  const longTermProvider = useLocalStorage('settings/memory/long-term/provider', getEnvValue('LONG_TERM_MEMORY_PROVIDER', getEnvValue('MEMORY_LONG_TERM_PROVIDER', 'postgres-pgvector') as string) as string)
  const longTermConnectionString = useLocalStorage('settings/memory/long-term/connection-string', '')
  const longTermHost = useLocalStorage('settings/memory/long-term/host', '')
  const longTermPort = useLocalStorage('settings/memory/long-term/port', 5432)
  const longTermDatabase = useLocalStorage('settings/memory/long-term/database', 'postgres')
  const longTermUser = useLocalStorage('settings/memory/long-term/user', 'postgres')
  const longTermPassword = useLocalStorage('settings/memory/long-term/password', '')
  const longTermSsl = useLocalStorage('settings/memory/long-term/ssl', false)

  const longTermQdrantUrl = useLocalStorage('settings/memory/long-term/qdrant/url', 'http://localhost:6333')
  const longTermQdrantApiKey = useLocalStorage('settings/memory/long-term/qdrant/api-key', '')
  const longTermQdrantCollection = useLocalStorage('settings/memory/long-term/qdrant/collection', 'memory_entries')
  const longTermQdrantVectorSize = useLocalStorage('settings/memory/long-term/qdrant/vector-size', 1536)

  const embeddingProvider = useLocalStorage<EmbeddingProviderType>('settings/memory/embedding/provider', getEnvValue('MEMORY_EMBEDDING_PROVIDER', 'openai') as EmbeddingProviderType)
  const embeddingApiKey = useLocalStorage('settings/memory/embedding/api-key', getEnvValue('MEMORY_EMBEDDING_API_KEY', '') as string)
  const embeddingBaseUrl = useLocalStorage('settings/memory/embedding/base-url', getEnvValue('MEMORY_EMBEDDING_BASE_URL', '') as string)
  const embeddingAccountId = useLocalStorage('settings/memory/embedding/account-id', getEnvValue('CLOUDFLARE_ACCOUNT_ID', '') as string)
  const embeddingModel = useLocalStorage('settings/memory/embedding/model', getEnvValue('MEMORY_EMBEDDING_MODEL', 'text-embedding-3-small') as string)

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

    const data = await response.json() as { success: boolean, data?: Array<{ message: { role: string, content: unknown, timestamp: string | Date, metadata?: Record<string, unknown> } }> }
    if (!data.success || !Array.isArray(data.data)) {
      return []
    }

    relatedMemories.value = data.data.map(item => normalizeMessage(item.message))
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

    const data = await response.json() as { success: boolean, data?: Array<{ message: { role: string, content: unknown, timestamp: string | Date, metadata?: Record<string, unknown> } }> }
    if (!data.success || !Array.isArray(data.data)) {
      return []
    }

    return data.data.map(item => normalizeMessage(item.message))
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
          const connection = longTerm.connection ?? {}
          longTermConnectionString.value = connection.connectionString ?? ''
          longTermHost.value = connection.host ?? ''
          if (typeof connection.port === 'number') {
            longTermPort.value = connection.port
          }
          longTermDatabase.value = connection.database ?? 'postgres'
          longTermUser.value = connection.user ?? 'postgres'
          longTermPassword.value = connection.password ?? ''
          if (typeof connection.ssl === 'boolean') {
            longTermSsl.value = connection.ssl
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
          embeddingProvider.value = longTerm.embedding.provider ?? 'openai'
          embeddingApiKey.value = longTerm.embedding.apiKey ?? ''
          embeddingBaseUrl.value = longTerm.embedding.baseUrl ?? ''
          embeddingAccountId.value = longTerm.embedding.accountId ?? ''
          embeddingModel.value = longTerm.embedding.model ?? 'text-embedding-3-small'
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
        longTerm: enabledLongTerm.value
          ? longTermProvider.value === 'qdrant'
            ? {
              enabled: true,
              provider: 'qdrant',
              qdrant: {
                url: longTermQdrantUrl.value,
                apiKey: longTermQdrantApiKey.value || undefined,
                collectionName: longTermQdrantCollection.value || 'memory_entries',
                vectorSize: Number(longTermQdrantVectorSize.value) || undefined,
              },
              embedding: {
                provider: embeddingProvider.value,
                apiKey: embeddingApiKey.value,
                baseUrl: embeddingBaseUrl.value || undefined,
                accountId: embeddingAccountId.value || undefined,
                model: embeddingModel.value,
              },
            } satisfies QdrantLongTermPayload
            : {
              enabled: true,
              provider: 'postgres-pgvector',
              connection: {
                connectionString: longTermConnectionString.value || undefined,
                host: longTermHost.value || undefined,
                port: Number(longTermPort.value) || undefined,
                database: longTermDatabase.value || undefined,
                user: longTermUser.value || undefined,
                password: longTermPassword.value || undefined,
                ssl: Boolean(longTermSsl.value),
              },
              embedding: {
                provider: embeddingProvider.value,
                apiKey: embeddingApiKey.value,
                baseUrl: embeddingBaseUrl.value || undefined,
                accountId: embeddingAccountId.value || undefined,
                model: embeddingModel.value,
              },
            } satisfies PostgresLongTermPayload
          : longTermProvider.value === 'qdrant'
            ? {
              enabled: false,
              provider: 'qdrant',
              qdrant: {
                url: longTermQdrantUrl.value,
                apiKey: longTermQdrantApiKey.value || undefined,
                collectionName: longTermQdrantCollection.value || 'memory_entries',
                vectorSize: Number(longTermQdrantVectorSize.value) || undefined,
              },
            } satisfies QdrantLongTermPayload
            : {
              enabled: false,
              provider: 'postgres-pgvector',
              connection: {},
            } satisfies PostgresLongTermPayload,
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
