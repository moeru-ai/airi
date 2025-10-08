// Standalone memory service for Vercel serverless functions
// Supports Vercel KV and Upstash Redis for short-term memory

import { Redis } from '@upstash/redis'
import { kv as vercelKv } from '@vercel/kv'

export interface Message {
  role: string
  content: string | unknown
  timestamp: Date | string
  metadata?: Record<string, unknown>
}

export interface MemoryConfiguration {
  shortTerm: {
    provider: 'vercel-kv' | 'upstash-redis'
    namespace?: string
    maxMessages?: number
    ttlSeconds?: number
    upstash?: {
      url: string
      token: string
    }
  }
  longTerm?: {
    enabled: boolean
    provider: 'postgres-pgvector' | 'qdrant'
    [key: string]: unknown
  }
}

// In-memory configuration cache (per-instance)
let currentConfig: MemoryConfiguration | null = null
let redisClient: Redis | null = null

export function getConfiguration(): MemoryConfiguration {
  if (!currentConfig) {
    currentConfig = createConfigurationFromEnv()
  }
  return currentConfig
}

export function setConfiguration(config: MemoryConfiguration): void {
  currentConfig = config
  // Reset Redis client when config changes
  redisClient = null
}

function createConfigurationFromEnv(): MemoryConfiguration {
  // Determine provider based on available environment variables
  let provider: 'vercel-kv' | 'upstash-redis' = 'vercel-kv'

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    provider = 'upstash-redis'
  }

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

  // Long-term memory (placeholder)
  const longTermProvider = process.env.LONG_TERM_MEMORY_PROVIDER || process.env.MEMORY_LONG_TERM_PROVIDER

  if (longTermProvider && longTermProvider !== 'none') {
    config.longTerm = {
      enabled: true,
      provider: longTermProvider as 'postgres-pgvector' | 'qdrant',
    }
  }

  return config
}

// Helper to get or create Redis client
function getRedisClient(): Redis {
  if (!redisClient) {
    const config = getConfiguration()
    if (config.shortTerm.provider !== 'upstash-redis') {
      throw new Error('Redis client requested but provider is not upstash-redis')
    }
    if (!config.shortTerm.upstash) {
      throw new Error('Upstash configuration is missing')
    }

    redisClient = new Redis({
      url: config.shortTerm.upstash.url,
      token: config.shortTerm.upstash.token,
    })
  }
  return redisClient
}

// Helper to build Redis key
function buildKey(sessionId: string, namespace?: string): string {
  const ns = namespace || getConfiguration().shortTerm.namespace || 'memory'
  return `${ns}:session:${sessionId}`
}

// Save message to short-term memory
export async function saveMessage(sessionId: string, message: Message, userId?: string): Promise<void> {
  const config = getConfiguration()
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

  if (config.shortTerm.provider === 'vercel-kv') {
    // Vercel KV
    const existing = await vercelKv.get<Message[]>(key) || []
    const updated = [...existing, normalizedMessage]

    // Keep only last N messages
    const maxMessages = config.shortTerm.maxMessages || 20
    const trimmed = updated.slice(-maxMessages)

    // Save with TTL
    const ttl = config.shortTerm.ttlSeconds || 1800
    await vercelKv.setex(key, ttl, trimmed)
  }
  else if (config.shortTerm.provider === 'upstash-redis') {
    // Upstash Redis
    const redis = getRedisClient()
    const existing = await redis.get<Message[]>(key) || []
    const updated = [...existing, normalizedMessage]

    // Keep only last N messages
    const maxMessages = config.shortTerm.maxMessages || 20
    const trimmed = updated.slice(-maxMessages)

    // Save with TTL
    const ttl = config.shortTerm.ttlSeconds || 1800
    await redis.setex(key, ttl, JSON.stringify(trimmed))
  }
  else {
    throw new Error(`Unsupported short-term provider: ${config.shortTerm.provider}`)
  }
}

// Get recent messages from short-term memory
export async function getRecentMessages(sessionId: string, limit?: number): Promise<Message[]> {
  const config = getConfiguration()
  const key = buildKey(sessionId, config.shortTerm.namespace)

  let messages: Message[] = []

  if (config.shortTerm.provider === 'vercel-kv') {
    messages = await vercelKv.get<Message[]>(key) || []
  }
  else if (config.shortTerm.provider === 'upstash-redis') {
    const redis = getRedisClient()
    const data = await redis.get<string>(key)
    if (data) {
      messages = typeof data === 'string' ? JSON.parse(data) : data
    }
  }
  else {
    throw new Error(`Unsupported short-term provider: ${config.shortTerm.provider}`)
  }

  if (limit && limit > 0) {
    return messages.slice(-limit)
  }

  return messages
}

// Clear session memory
export async function clearSession(sessionId: string): Promise<void> {
  const config = getConfiguration()
  const key = buildKey(sessionId, config.shortTerm.namespace)

  if (config.shortTerm.provider === 'vercel-kv') {
    await vercelKv.del(key)
  }
  else if (config.shortTerm.provider === 'upstash-redis') {
    const redis = getRedisClient()
    await redis.del(key)
  }
  else {
    throw new Error(`Unsupported short-term provider: ${config.shortTerm.provider}`)
  }
}

// Search similar memories (placeholder - requires vector DB)
export async function searchSimilar(_query: string, _userId: string, _limit?: number): Promise<any[]> {
  // Long-term memory search requires vector database integration
  // This would need Postgres+pgvector or Qdrant setup
  console.warn('[Memory] Long-term memory search is not implemented in serverless mode')
  return []
}
