// Standalone memory service for Vercel serverless functions
// This is a simplified version that uses Vercel KV directly

import { kv } from '@vercel/kv'

export interface Message {
  role: string
  content: string | unknown
  timestamp: Date | string
  metadata?: Record<string, unknown>
}

export interface MemoryConfiguration {
  shortTerm: {
    provider: 'vercel-kv' | 'upstash-redis' | 'local-redis'
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
    connection?: Record<string, unknown>
    embedding?: {
      provider: string
      apiKey: string
      model: string
      baseUrl?: string
      accountId?: string
    }
  }
}

// In-memory configuration cache (per-instance)
let currentConfig: MemoryConfiguration | null = null

export function getConfiguration(): MemoryConfiguration {
  if (!currentConfig) {
    currentConfig = createConfigurationFromEnv()
  }
  return currentConfig
}

export function setConfiguration(config: MemoryConfiguration): void {
  currentConfig = config
}

function createConfigurationFromEnv(): MemoryConfiguration {
  const provider = (process.env.SHORT_TERM_MEMORY_PROVIDER
    || process.env.MEMORY_PROVIDER
    || 'vercel-kv') as 'vercel-kv' | 'upstash-redis' | 'local-redis'

  const config: MemoryConfiguration = {
    shortTerm: {
      provider,
      namespace: process.env.MEMORY_NAMESPACE || 'memory',
      maxMessages: Number.parseInt(process.env.SHORT_TERM_MEMORY_MAX_MESSAGES || '20', 10),
      ttlSeconds: Number.parseInt(process.env.SHORT_TERM_MEMORY_TTL_SECONDS || '1800', 10),
    },
  }

  if (provider === 'upstash-redis') {
    config.shortTerm.upstash = {
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    }
  }
  else if (provider === 'local-redis') {
    config.shortTerm.redis = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    }
  }

  // Long-term memory configuration (optional)
  const longTermProvider = (process.env.LONG_TERM_MEMORY_PROVIDER
    || process.env.MEMORY_LONG_TERM_PROVIDER) as 'postgres-pgvector' | 'qdrant' | undefined

  if (longTermProvider) {
    config.longTerm = {
      enabled: true,
      provider: longTermProvider,
      embedding: {
        provider: process.env.MEMORY_EMBEDDING_PROVIDER || 'openai',
        apiKey: process.env.MEMORY_EMBEDDING_API_KEY || '',
        model: process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small',
        baseUrl: process.env.MEMORY_EMBEDDING_BASE_URL,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      },
    }
  }

  return config
}

// Helper to build Redis key
function buildKey(sessionId: string, namespace?: string): string {
  const ns = namespace || getConfiguration().shortTerm.namespace || 'memory'
  return `${ns}:session:${sessionId}`
}

// Save message to short-term memory (Vercel KV)
export async function saveMessage(sessionId: string, message: Message, userId?: string): Promise<void> {
  const config = getConfiguration()

  if (config.shortTerm.provider !== 'vercel-kv') {
    throw new Error('Only Vercel KV is supported in serverless mode. Please configure SHORT_TERM_MEMORY_PROVIDER=vercel-kv')
  }

  const key = buildKey(sessionId, config.shortTerm.namespace)

  // Normalize message
  const normalizedMessage = {
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
    metadata: {
      ...(message.metadata || {}),
      ...(userId ? { userId } : {}),
    },
  }

  // Get existing messages
  const existing = await kv.get<Message[]>(key) || []

  // Add new message
  const updated = [...existing, normalizedMessage]

  // Keep only last N messages
  const maxMessages = config.shortTerm.maxMessages || 20
  const trimmed = updated.slice(-maxMessages)

  // Save with TTL
  const ttl = config.shortTerm.ttlSeconds || 1800
  await kv.setex(key, ttl, trimmed)
}

// Get recent messages from short-term memory
export async function getRecentMessages(sessionId: string, limit?: number): Promise<Message[]> {
  const config = getConfiguration()

  if (config.shortTerm.provider !== 'vercel-kv') {
    throw new Error('Only Vercel KV is supported in serverless mode')
  }

  const key = buildKey(sessionId, config.shortTerm.namespace)
  const messages = await kv.get<Message[]>(key) || []

  if (limit && limit > 0) {
    return messages.slice(-limit)
  }

  return messages
}

// Clear session memory
export async function clearSession(sessionId: string): Promise<void> {
  const config = getConfiguration()

  if (config.shortTerm.provider !== 'vercel-kv') {
    throw new Error('Only Vercel KV is supported in serverless mode')
  }

  const key = buildKey(sessionId, config.shortTerm.namespace)
  await kv.del(key)
}

// Search similar memories (placeholder - requires vector DB)
export async function searchSimilar(_query: string, _userId: string, _limit?: number): Promise<any[]> {
  // This would require vector database integration
  // For now, return empty array
  console.warn('Long-term memory search is not implemented in serverless mode')
  return []
}
