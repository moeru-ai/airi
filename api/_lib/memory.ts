// Standalone memory service for Vercel serverless functions
// Supports Vercel KV and Upstash Redis for short-term memory
// Supports Postgres+pgvector and Qdrant for long-term memory

import type { QueryResult, QueryResultRow } from 'pg'

import { randomUUID } from 'node:crypto'

import OpenAI from 'openai'

import { QdrantClient } from '@qdrant/js-client-rest'
import { Redis } from '@upstash/redis'
import { kv as vercelKv } from '@vercel/kv'
import { sql } from '@vercel/postgres'
import { Pool } from 'pg'

interface SqlQueryExecutor {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>
}

const vercelSql = sql as unknown as SqlQueryExecutor

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
      provider: 'openai' | 'cloudflare' | 'openai-compatible'
      model?: string
      dimensions?: number
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
let externalPostgresPool: Pool | null = null
let externalPostgresPoolConnectionString: string | null = null

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

  if (externalPostgresPool) {
    externalPostgresPool.end().catch(() => {})
    externalPostgresPool = null
    externalPostgresPoolConnectionString = null
  }
}

function createConfigurationFromEnv(): MemoryConfiguration {
  // Determine provider based on SHORT_TERM_MEMORY_PROVIDER or MEMORY_PROVIDER env var
  const providerEnv = (process.env.SHORT_TERM_MEMORY_PROVIDER || process.env.MEMORY_PROVIDER || '').toLowerCase()

  const upstashUrl = process.env.UPSTASH_KV_REST_API_URL || process.env.UPSTASH_KV_URL || process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  const hasVercelKV = Boolean(process.env.KV_REST_API_URL || process.env.KV_URL)

  // Default to upstash-redis if available, otherwise vercel-kv
  let provider: 'vercel-kv' | 'upstash-redis' = (upstashUrl && upstashToken) ? 'upstash-redis' : 'vercel-kv'

  // Explicitly check for provider setting first
  if (providerEnv === 'upstash-redis') {
    provider = 'upstash-redis'
  }
  else if (providerEnv === 'vercel-kv') {
    provider = 'vercel-kv'
  }
  else if (!upstashUrl && !upstashToken && hasVercelKV) {
    // Auto-detect Vercel KV when Upstash not available
    provider = 'vercel-kv'
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
    const embeddingProvider = (process.env.MEMORY_EMBEDDING_PROVIDER || process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'cloudflare' | 'openai-compatible'
    config.longTerm.embedding = {
      provider: embeddingProvider,
      model: process.env.MEMORY_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL,
      dimensions: (() => {
        const value = process.env.MEMORY_EMBEDDING_DIMENSIONS || process.env.EMBEDDING_DIMENSIONS
        return value ? Number.parseInt(value, 10) : undefined
      })(),
      apiKey: process.env.MEMORY_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY,
      baseUrl: process.env.MEMORY_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL,
      accountId: process.env.MEMORY_EMBEDDING_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.MEMORY_EMBEDDING_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN,
    }

    if (embeddingProvider === 'openai' || embeddingProvider === 'openai-compatible') {
      config.longTerm.embedding.openai = {
        apiKey: process.env.MEMORY_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
        baseURL: process.env.MEMORY_EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL,
      }
    }
    else if (embeddingProvider === 'cloudflare') {
      config.longTerm.embedding.cloudflare = {
        accountId: process.env.MEMORY_EMBEDDING_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '',
        apiToken: process.env.MEMORY_EMBEDDING_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '',
        model: process.env.MEMORY_EMBEDDING_MODEL || process.env.CLOUDFLARE_EMBEDDING_MODEL || '@cf/baai/bge-base-en-v1.5',
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
    const embedding = config.longTerm?.embedding

    if (!embedding || embedding.provider === 'cloudflare') {
      throw new Error('OpenAI configuration is missing')
    }

    const openaiConfig = embedding.openai ?? {
      apiKey: embedding.apiKey ?? '',
      baseURL: embedding.baseUrl ?? (embedding as Record<string, unknown>).baseURL as string | undefined,
    }

    if (!openaiConfig.apiKey) {
      throw new Error('OpenAI API key is missing')
    }

    embedding.openai = openaiConfig

    openaiClient = new OpenAI({
      apiKey: openaiConfig.apiKey,
      baseURL: openaiConfig.baseURL,
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

  if (provider === 'openai' || provider === 'openai-compatible') {
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

    const payload = await response.json() as Record<string, any>
    const embedding = extractCloudflareEmbedding(payload)

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Cloudflare embedding response did not include an embedding vector.')
    }

    return embedding.map((value: number | string) => Number(value))
  }

  throw new Error(`Unsupported embedding provider: ${provider}`)
}

function extractCloudflareEmbedding(payload: Record<string, any>): number[] | undefined {
  const result = payload.result ?? payload

  if (Array.isArray(result?.data) && result.data.length > 0) {
    const candidate = result.data[0]
    if (Array.isArray(candidate?.embedding)) {
      return candidate.embedding as number[]
    }
    if (Array.isArray(candidate?.vector)) {
      return candidate.vector as number[]
    }
  }

  if (Array.isArray(result?.embedding)) {
    return result.embedding as number[]
  }

  if (Array.isArray(result?.data?.embedding)) {
    return result.data.embedding as number[]
  }

  return undefined
}

function sanitizeTableName(tableName?: string): string {
  const candidate = tableName || 'memory_embeddings'
  if (!/^[A-Z_]\w*$/i.test(candidate)) {
    throw new Error(`Invalid Postgres table name: ${candidate}`)
  }
  return candidate
}

async function savePostgresMemoryEntry(
  config: MemoryConfiguration,
  userId: string,
  content: string,
  embedding: number[],
  metadata: Record<string, unknown> | undefined,
  createdAt: string | undefined,
): Promise<void> {
  const tableName = sanitizeTableName(config.longTerm?.postgres?.tableName)
  const query = `
    INSERT INTO ${tableName} (id, user_id, content, embedding, metadata, created_at)
    VALUES ($1::uuid, $2, $3, $4::vector, $5::jsonb, COALESCE($6::timestamptz, NOW()))
  `

  const metadataJson = metadata ? JSON.stringify(metadata) : null
  const createdAtValue = createdAt ? new Date(createdAt).toISOString() : null

  await runPostgresQuery(config, query, [
    randomUUID(),
    userId,
    content,
    JSON.stringify(embedding),
    metadataJson,
    createdAtValue,
  ])
}

async function saveQdrantMemoryEntry(
  config: MemoryConfiguration,
  userId: string,
  content: string,
  embedding: number[],
  metadata: Record<string, unknown> | undefined,
  createdAt: string | undefined,
): Promise<void> {
  const qdrant = getQdrantClient()
  const collectionName = config.longTerm?.qdrant?.collectionName || 'memory'

  const payload: Record<string, unknown> = {
    userId,
    content,
    timestamp: createdAt,
    metadata,
  }

  await qdrant.upsert(collectionName, {
    wait: false,
    points: [
      {
        id: randomUUID(),
        vector: embedding,
        payload,
      },
    ],
  })
}

async function persistLongTermMemory(
  sessionId: string,
  message: Message,
  config: MemoryConfiguration,
  userId?: string,
): Promise<void> {
  if (!config.longTerm?.enabled) {
    return
  }

  if (!userId) {
    return
  }

  const shouldPersist = Boolean(message.metadata && message.metadata.persistLongTerm)
  if (!shouldPersist) {
    return
  }

  const contentString = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content)

  if (!contentString || !contentString.trim()) {
    return
  }

  const metadata: Record<string, unknown> = {
    ...(message.metadata ? { ...message.metadata } : {}),
    role: message.role,
    sessionId,
  }

  delete metadata.persistLongTerm

  const timestamp = typeof message.timestamp === 'string'
    ? message.timestamp
    : message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : undefined

  try {
    const embedding = await generateEmbedding(contentString)

    if (config.longTerm.provider === 'postgres-pgvector') {
      await savePostgresMemoryEntry(config, userId, contentString, embedding, metadata, timestamp)
    }
    else if (config.longTerm.provider === 'qdrant') {
      await saveQdrantMemoryEntry(config, userId, contentString, embedding, metadata, timestamp)
    }
    else {
      console.warn(`[Memory] Unsupported long-term provider: ${config.longTerm.provider}`)
    }
  }
  catch (error) {
    console.error('[Memory] Failed to persist long-term memory:', error)
  }
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

  await persistLongTermMemory(sessionId, normalizedMessage, config, userId)
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
  const tableName = sanitizeTableName(config.longTerm?.postgres?.tableName)

  interface PostgresRow {
    id: string
    content: string
    metadata: Record<string, unknown> | null
    timestamp: string
    score: number
  }

  const query = `
      SELECT
        id::text,
        content,
        metadata,
        created_at::text as timestamp,
        1 - (embedding <=> $2::vector) as score
      FROM ${tableName}
      WHERE user_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
    `

  try {
    const result = await runPostgresQuery<PostgresRow>(config, query, [
      userId,
      JSON.stringify(embedding),
      limit,
    ])

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      score: row.score,
      metadata: row.metadata ?? {},
      timestamp: row.timestamp,
    }))
  }
  catch (error) {
    console.error('[Memory] Postgres search error:', error)
    throw new Error(`Postgres search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function runPostgresQuery<T extends QueryResultRow = QueryResultRow>(
  config: MemoryConfiguration,
  query: string,
  params: unknown[],
): Promise<QueryResult<T>> {
  const overrideConnection = config.longTerm?.postgres?.connectionString?.trim()
  const envConnections = [process.env.POSTGRES_URL, process.env.DATABASE_URL].filter((value): value is string => Boolean(value))

  if (overrideConnection && !envConnections.includes(overrideConnection)) {
    if (!externalPostgresPool || externalPostgresPoolConnectionString !== overrideConnection) {
      if (externalPostgresPool) {
        await externalPostgresPool.end().catch(() => {})
      }

      externalPostgresPool = new Pool({
        connectionString: overrideConnection,
        max: 1,
        idleTimeoutMillis: 10_000,
      })
      externalPostgresPoolConnectionString = overrideConnection
    }

    const pool = externalPostgresPool as Pool
    return pool.query(query, params) as Promise<QueryResult<T>>
  }

  if (envConnections.length > 0) {
    return vercelSql.query<T>(query, params)
  }

  throw new Error('Postgres connection string is not configured')
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
