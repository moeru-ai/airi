import type { MemoryConfiguration, Message, ShortTermProviderConfiguration, ShortTermProviderType } from '@proj-airi/memory-system'

import { env } from 'node:process'

import { MemorySystemFactory } from '@proj-airi/memory-system'

interface SaveMessagePayload {
  sessionId: string
  message: Message
  userId?: string
}

let runtimeConfig: MemoryConfiguration = createConfigurationFromEnv()
let memoryProvider = MemorySystemFactory.create({
  configuration: runtimeConfig,
  onError: handleProviderError,
})
let initialized = false

export async function configureMemorySystem(configuration: MemoryConfiguration): Promise<void> {
  runtimeConfig = configuration
  memoryProvider = MemorySystemFactory.create({
    configuration: runtimeConfig,
    onError: handleProviderError,
  })
  initialized = false
  await ensureInitialized()
}

export function getMemoryConfiguration(): MemoryConfiguration {
  return runtimeConfig
}

export async function saveShortTermMemory(payload: SaveMessagePayload): Promise<void> {
  await ensureInitialized()
  if (payload.userId) {
    payload.message.metadata = {
      ...(payload.message.metadata ?? {}),
      userId: payload.userId,
    }
  }

  await memoryProvider.addMessage(payload.sessionId, payload.message)
}

export async function getRecentMessages(sessionId: string, limit?: number) {
  await ensureInitialized()
  return memoryProvider.getRecentMessages(sessionId, limit)
}

export async function searchUserMemory(query: string, userId: string, limit?: number) {
  await ensureInitialized()
  return memoryProvider.searchSimilar(query, userId, limit)
}

export async function clearSessionMemory(sessionId: string) {
  await ensureInitialized()
  await memoryProvider.clearSession(sessionId)
}

export async function exportUserMemory(userId: string, limit = 200) {
  await ensureInitialized()
  return memoryProvider.searchSimilar('summary export', userId, limit)
}

async function ensureInitialized(): Promise<void> {
  if (initialized) {
    return
  }

  await memoryProvider.initialize()
  initialized = true
}

function handleProviderError(error: unknown, context: { operation: string, provider: 'short-term' | 'long-term', payload?: unknown }) {
  console.error('[memory-service]', context.operation, context.provider, error)
}

function createConfigurationFromEnv(): MemoryConfiguration {
  const shortTerm = resolveShortTermConfigurationFromEnv()
  const provider = (env.LONG_TERM_MEMORY_PROVIDER ?? env.MEMORY_LONG_TERM_PROVIDER ?? 'postgres-pgvector').toLowerCase()
  const longTermEnabled = resolveLongTermEnabled(provider)

  const configuration: MemoryConfiguration = {
    shortTerm,
  }

  if (provider === 'qdrant') {
    configuration.longTerm = {
      enabled: longTermEnabled,
      provider: 'qdrant',
      qdrant: {
        url: env.QDRANT_URL ?? '',
        apiKey: env.QDRANT_API_KEY ?? undefined,
        collectionName: env.QDRANT_COLLECTION ?? 'memory_entries',
        vectorSize: parseOptionalInteger(env.QDRANT_VECTOR_SIZE),
      },
      embedding: buildEmbeddingConfiguration(),
    }
  }
  else {
    configuration.longTerm = {
      enabled: longTermEnabled,
      provider: 'postgres-pgvector',
      connection: {
        connectionString: env.POSTGRES_URL
          ?? env.POSTGRES_PRISMA_URL
          ?? env.DATABASE_URL,
        host: env.POSTGRES_HOST,
        port: parseOptionalInteger(env.POSTGRES_PORT),
        database: env.POSTGRES_DATABASE,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        ssl: parseBoolean(env.POSTGRES_SSL),
      },
      embedding: buildEmbeddingConfiguration(),
    }
  }

  return configuration
}

function resolveShortTermConfigurationFromEnv(): ShortTermProviderConfiguration {
  const envProvider = (env.MEMORY_PROVIDER
    ?? env.SHORT_TERM_MEMORY_PROVIDER
    ?? 'local-redis') as ShortTermProviderType

  const provider = normalizeShortTermProvider(envProvider)

  const configuration: ShortTermProviderConfiguration = {
    provider,
    namespace: env.MEMORY_NAMESPACE ?? 'memory',
    maxMessages: parseOptionalInteger(env.SHORT_TERM_MEMORY_MAX_MESSAGES) ?? 20,
    ttlSeconds: parseOptionalInteger(env.SHORT_TERM_MEMORY_TTL_SECONDS) ?? (60 * 30),
  }

  if (provider === 'upstash-redis') {
    configuration.upstash = {
      url: env.UPSTASH_KV_REST_API_URL ?? env.UPSTASH_KV_URL ?? '',
      token: env.UPSTASH_KV_REST_API_TOKEN ?? '',
    }
  }

  if (provider === 'local-redis') {
    configuration.redis = {
      host: env.REDIS_HOST,
      port: parseOptionalInteger(env.REDIS_PORT) ?? 6379,
      password: env.REDIS_PASSWORD,
    }
  }

  return configuration
}

function normalizeShortTermProvider(provider: ShortTermProviderType): ShortTermProviderType {
  if (provider === 'upstash-redis') {
    if (!env.UPSTASH_KV_REST_API_URL || !env.UPSTASH_KV_REST_API_TOKEN) {
      return 'local-redis'
    }
  }

  return provider
}

function buildEmbeddingConfiguration() {
  const apiKey = env.MEMORY_EMBEDDING_API_KEY ?? env.OPENAI_API_KEY ?? ''

  return {
    provider: (env.MEMORY_EMBEDDING_PROVIDER as any) ?? 'openai',
    apiKey,
    baseUrl: env.MEMORY_EMBEDDING_BASE_URL,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    model: env.MEMORY_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  }
}

function resolveLongTermEnabled(provider: string): boolean {
  if (provider === 'none') {
    return false
  }

  if (provider === 'qdrant') {
    const hasUrl = Boolean(env.QDRANT_URL)
    const hasApiKey = Boolean(env.MEMORY_EMBEDDING_API_KEY || env.OPENAI_API_KEY)
    return hasUrl && hasApiKey
  }

  const hasConnection = Boolean(env.POSTGRES_URL
    || env.POSTGRES_PRISMA_URL
    || env.DATABASE_URL
    || env.POSTGRES_HOST)

  const hasApiKey = Boolean(env.MEMORY_EMBEDDING_API_KEY || env.OPENAI_API_KEY)

  return hasConnection && hasApiKey
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null) {
    return undefined
  }

  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

export type { SaveMessagePayload }
