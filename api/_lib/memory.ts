// Standalone memory service for Vercel serverless functions
// Supports Vercel KV and Upstash Redis for short-term memory
// Supports Postgres+pgvector and Qdrant for long-term memory

import OpenAI from 'openai'

import { QdrantClient } from '@qdrant/js-client-rest'
import { Redis } from '@upstash/redis'
import { kv as vercelKv } from '@vercel/kv'
import { sql } from '@vercel/postgres'

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
    postgres?: {
      connectionString?: string
      tableName?: string
    }
    qdrant?: {
      url: string
      apiKey?: string
      collectionName?: string
    }
    embedding?: {
      provider: 'openai' | 'cloudflare'
      model?: string
      dimensions?: number
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

export interface MemorySearchResult {
  id: string
  content: string
  score: number
  metadata?: Record<string, unknown>
  timestamp?: string
}

// In-memory configuration cache (per-instance)
let currentConfig: MemoryConfiguration | null = null
let redisClient: Redis | null = null
let qdrantClient: QdrantClient | null = null
let openaiClient: OpenAI | null = null

export function getConfiguration(): MemoryConfiguration {
  if (!currentConfig) {
    currentConfig = createConfigurationFromEnv()
  }
  return currentConfig
}

export function setConfiguration(config: MemoryConfiguration): void {
  currentConfig = config
  // Reset clients when config changes
  redisClient = null
  qdrantClient = null
  openaiClient = null
}

function createConfigurationFromEnv(): MemoryConfiguration {
  // Determine provider based on SHORT_TERM_MEMORY_PROVIDER or MEMORY_PROVIDER env var
  const providerEnv = (process.env.SHORT_TERM_MEMORY_PROVIDER || process.env.MEMORY_PROVIDER || '').toLowerCase()
  let provider: 'vercel-kv' | 'upstash-redis' = 'vercel-kv'

  const upstashUrl = process.env.UPSTASH_KV_REST_API_URL || process.env.UPSTASH_KV_URL || process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

  // Explicitly check for provider setting first
  if (providerEnv === 'upstash-redis') {
    provider = 'upstash-redis'
  }
  else if (providerEnv === 'vercel-kv' || providerEnv === '') {
    // Use vercel-kv if explicitly set or not set
    provider = 'vercel-kv'
  }
  else if (upstashUrl && upstashToken) {
    // Fallback: auto-detect based on environment variables
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
      url: upstashUrl || '',
      token: upstashToken || '',
    }
  }

  // Long-term memory configuration
  const longTermProvider = process.env.LONG_TERM_MEMORY_PROVIDER || process.env.MEMORY_LONG_TERM_PROVIDER

  if (longTermProvider && longTermProvider !== 'none') {
    config.longTerm = {
      enabled: true,
      provider: longTermProvider as 'postgres-pgvector' | 'qdrant',
    }

    // Postgres configuration
    if (longTermProvider === 'postgres-pgvector') {
      config.longTerm.postgres = {
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        tableName: process.env.MEMORY_TABLE_NAME || 'memory_embeddings',
      }
    }

    // Qdrant configuration
    if (longTermProvider === 'qdrant') {
      config.longTerm.qdrant = {
        url: process.env.QDRANT_URL || '',
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: process.env.QDRANT_COLLECTION_NAME || 'memory',
      }
    }

    // Embedding configuration
    const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'openai'
    config.longTerm.embedding = {
      provider: embeddingProvider as 'openai' | 'cloudflare',
      model: process.env.EMBEDDING_MODEL,
      dimensions: process.env.EMBEDDING_DIMENSIONS ? Number.parseInt(process.env.EMBEDDING_DIMENSIONS, 10) : undefined,
    }

    if (embeddingProvider === 'openai') {
      config.longTerm.embedding.openai = {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL,
      }
    }
    else if (embeddingProvider === 'cloudflare') {
      config.longTerm.embedding.cloudflare = {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
        apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
        model: process.env.CLOUDFLARE_EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5',
      }
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

// Helper to get or create Qdrant client
function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const config = getConfiguration()
    if (!config.longTerm || config.longTerm.provider !== 'qdrant') {
      throw new Error('Qdrant client requested but provider is not qdrant')
    }
    if (!config.longTerm.qdrant) {
      throw new Error('Qdrant configuration is missing')
    }

    qdrantClient = new QdrantClient({
      url: config.longTerm.qdrant.url,
      apiKey: config.longTerm.qdrant.apiKey,
    })
  }
  return qdrantClient
}

// Helper to get or create OpenAI client
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const config = getConfiguration()
    if (!config.longTerm?.embedding?.openai) {
      throw new Error('OpenAI configuration is missing')
    }

    openaiClient = new OpenAI({
      apiKey: config.longTerm.embedding.openai.apiKey,
      baseURL: config.longTerm.embedding.openai.baseURL,
    })
  }
  return openaiClient
}

// Generate embedding vector
async function generateEmbedding(text: string): Promise<number[]> {
  const config = getConfiguration()

  if (!config.longTerm?.embedding) {
    throw new Error('Embedding configuration is missing')
  }

  const { provider, model } = config.longTerm.embedding

  if (provider === 'openai') {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
      model: model || 'text-embedding-3-small',
      input: text,
    })
    return response.data[0].embedding
  }
  else if (provider === 'cloudflare') {
    const { cloudflare } = config.longTerm.embedding
    if (!cloudflare) {
      throw new Error('Cloudflare configuration is missing')
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cloudflare.accountId}/ai/run/${cloudflare.model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cloudflare.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
    )

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.statusText}`)
    }

    const data = await response.json() as { result: { data: number[][] } }
    return data.result.data[0]
  }

  throw new Error(`Unsupported embedding provider: ${provider}`)
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

// Search similar memories from long-term storage
export async function searchSimilar(query: string, userId: string, limit?: number): Promise<MemorySearchResult[]> {
  const config = getConfiguration()

  if (!config.longTerm?.enabled) {
    console.warn('[Memory] Long-term memory is not enabled')
    return []
  }

  const { provider } = config.longTerm
  const searchLimit = limit || 10

  // Generate embedding for the query
  const embedding = await generateEmbedding(query)

  if (provider === 'postgres-pgvector') {
    return searchPostgres(embedding, userId, searchLimit)
  }
  else if (provider === 'qdrant') {
    return searchQdrant(embedding, userId, searchLimit)
  }

  throw new Error(`Unsupported long-term provider: ${provider}`)
}

// Search Postgres with pgvector
async function searchPostgres(embedding: number[], userId: string, limit: number): Promise<MemorySearchResult[]> {
  const config = getConfiguration()
  const tableName = config.longTerm?.postgres?.tableName || 'memory_embeddings'

  try {
    // Assumes table schema:
    // CREATE TABLE memory_embeddings (
    //   id UUID PRIMARY KEY,
    //   user_id TEXT NOT NULL,
    //   content TEXT NOT NULL,
    //   embedding VECTOR(1536),
    //   metadata JSONB,
    //   created_at TIMESTAMP DEFAULT NOW()
    // );
    // CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops);

    const result = await sql`
      SELECT
        id::text,
        content,
        metadata,
        created_at::text as timestamp,
        1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as score
      FROM ${sql(tableName)}
      WHERE user_id = ${userId}
      ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
      LIMIT ${limit}
    `

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      score: row.score,
      metadata: row.metadata || {},
      timestamp: row.timestamp,
    }))
  }
  catch (error) {
    console.error('[Memory] Postgres search error:', error)
    throw new Error(`Postgres search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Search Qdrant
async function searchQdrant(embedding: number[], userId: string, limit: number): Promise<MemorySearchResult[]> {
  const config = getConfiguration()
  const collectionName = config.longTerm?.qdrant?.collectionName || 'memory'

  try {
    const qdrant = getQdrantClient()

    // Assumes collection exists with schema:
    // - vector field: "embedding"
    // - payload fields: userId, content, metadata, timestamp

    const searchResult = await qdrant.search(collectionName, {
      vector: embedding,
      filter: {
        must: [
          {
            key: 'userId',
            match: { value: userId },
          },
        ],
      },
      limit,
      with_payload: true,
    })

    return searchResult.map(result => ({
      id: String(result.id),
      content: (result.payload?.content as string) || '',
      score: result.score,
      metadata: (result.payload?.metadata as Record<string, unknown>) || {},
      timestamp: (result.payload?.timestamp as string) || undefined,
    }))
  }
  catch (error) {
    console.error('[Memory] Qdrant search error:', error)
    throw new Error(`Qdrant search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
