import type { Pool } from 'pg'

import type { IMemoryProvider, MemorySearchResult, Message } from '../../interfaces/memory.interface'
import type { EmbeddingProviderConfiguration } from '../../types/config'

import { env } from 'node:process'

import OpenAI from 'openai'

import { createPool } from '@vercel/postgres'

const DEFAULT_TABLE_NAME = 'conversations'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const DEFAULT_EMBEDDING_DIMENSIONS = 1536

export interface PostgresPgvectorMemoryOptions {
  connectionString?: string
  pool?: Pool
  tableName?: string
  embeddingModel?: string
  embeddingDimensions?: number
  openAIApiKey?: string
  embedding?: EmbeddingProviderConfiguration
}

interface MemoryRow {
  user_id: string
  session_id: string | null
  role: string | null
  content: string
  metadata: unknown
  created_at: string | Date
  distance?: number
}

export class PostgresPgvectorMemoryProvider implements IMemoryProvider {
  private readonly pool: Pool
  private readonly openai: OpenAI | null
  private readonly tableName: string
  private readonly embeddingConfig: EmbeddingProviderConfiguration
  private embeddingModel: string
  private embeddingDimensions: number

  constructor(options: PostgresPgvectorMemoryOptions = {}) {
    this.tableName = this.validateTableName(options.tableName ?? DEFAULT_TABLE_NAME)
    this.embeddingConfig = this.resolveEmbeddingConfiguration(options.embedding, options.embeddingModel, options.openAIApiKey)
    this.embeddingModel = this.embeddingConfig.model ?? DEFAULT_EMBEDDING_MODEL
    this.embeddingDimensions = options.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS

    const connectionString = options.connectionString
      ?? env.POSTGRES_URL
      ?? env.POSTGRES_PRISMA_URL
      ?? env.DATABASE_URL

    if (!options.pool && !connectionString) {
      throw new Error('PostgresPgvectorMemoryProvider requires a connection string or an existing Pool instance.')
    }

    this.pool = options.pool ?? createPool({ connectionString: connectionString! })

    this.openai = this.embeddingConfig.provider === 'cloudflare'
      ? null
      : new OpenAI({ apiKey: this.embeddingConfig.apiKey, baseURL: this.embeddingConfig.baseUrl })
  }

  async initialize(): Promise<void> {
    await this.ensureExtension()
    await this.ensureTable()
    await this.ensureIndexes()
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const derivedUserId = this.extractUserId(message)
    if (!derivedUserId) {
      return
    }

    const metadata = {
      ...message.metadata,
      sessionId,
    }

    await this.saveLongTermMemory({ ...message, metadata }, derivedUserId)
  }

  async getRecentMessages(sessionId: string, limit = 50): Promise<Message[]> {
    const { rows } = await this.pool.query(
      `SELECT user_id, session_id, role, content, metadata, created_at
       FROM ${this.tableName}
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [sessionId, limit],
    )

    return (rows as MemoryRow[])
      .map(row => this.rowToMessage(row))
      .reverse()
  }

  async searchSimilar(query: string, userId: string, limit = 10): Promise<MemorySearchResult[]> {
    const embedding = await this.generateEmbedding(query)
    const vector = this.toVectorLiteral(embedding)

    const { rows } = await this.pool.query(
      `SELECT user_id, session_id, role, content, metadata, created_at,
              embedding <-> $2::vector AS distance
       FROM ${this.tableName}
       WHERE user_id = $1
       ORDER BY embedding <-> $2::vector
       LIMIT $3`,
      [userId, vector, limit],
    )

    return (rows as MemoryRow[]).map((row) => {
      const message = this.rowToMessage(row)
      const distance = typeof row.distance === 'number' ? row.distance : Number(row.distance ?? 0)
      const similarity = Math.max(0, 1 - distance)

      return {
        message,
        similarity,
        timestamp: message.timestamp,
        metadata: message.metadata,
      } satisfies MemorySearchResult
    })
  }

  async saveLongTermMemory(message: Message, userId: string): Promise<void> {
    const embedding = await this.generateEmbedding(message.content)
    const vector = this.toVectorLiteral(embedding)
    const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp)
    const sessionId = this.extractSessionId(message)
    const metadata = message.metadata ?? null

    await this.pool.query(
      `INSERT INTO ${this.tableName}
        (user_id, session_id, role, content, metadata, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
      [
        userId,
        sessionId ?? null,
        message.role ?? null,
        message.content,
        metadata,
        vector,
        timestamp.toISOString(),
      ],
    )
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.tableName} WHERE session_id = $1`, [sessionId])
  }

  private async ensureExtension(): Promise<void> {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector;')
  }

  private async ensureTable(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT,
        role TEXT,
        content TEXT NOT NULL,
        metadata JSONB,
        embedding vector(${this.embeddingDimensions}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );`,
    )
  }

  private async ensureIndexes(): Promise<void> {
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.tableName}_user_id_idx ON ${this.tableName} (user_id);`)
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.tableName}_session_id_idx ON ${this.tableName} (session_id);`)
    await this.pool.query(`CREATE INDEX IF NOT EXISTS ${this.tableName}_created_at_idx ON ${this.tableName} (created_at DESC);`)
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
       ON ${this.tableName}
       USING ivfflat (embedding vector_l2_ops)
       WITH (lists = 100);`,
    )
  }

  private async generateEmbedding(input: string): Promise<number[]> {
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      return Array.from({ length: this.embeddingDimensions }, () => 0)
    }

    let embedding: number[] = []

    if (this.embeddingConfig.provider === 'cloudflare') {
      embedding = await this.generateCloudflareEmbedding(trimmed)
    }
    else {
      if (!this.openai) {
        throw new Error('OpenAI-compatible client is not configured for embeddings.')
      }

      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: trimmed,
      })

      embedding = response.data?.[0]?.embedding ?? []
    }

    if (!embedding.length) {
      throw new Error('Failed to generate embedding for memory content.')
    }

    if (!this.embeddingDimensions) {
      this.embeddingDimensions = embedding.length
    }

    if (embedding.length !== this.embeddingDimensions) {
      throw new Error(`Embedding dimension mismatch. Expected ${this.embeddingDimensions}, received ${embedding.length}.`)
    }

    return embedding.map((value: number | string) => Number(value))
  }

  private extractUserId(message: Message): string | null {
    const metadata = message.metadata ?? {}
    const candidate = (metadata as Record<string, unknown>).userId
      ?? (metadata as Record<string, unknown>).userID
      ?? (metadata as Record<string, unknown>).user_id

    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  }

  private extractSessionId(message: Message): string | null {
    const metadata = message.metadata ?? {}
    const candidate = (metadata as Record<string, unknown>).sessionId
      ?? (metadata as Record<string, unknown>).sessionID
      ?? (metadata as Record<string, unknown>).session_id

    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  }

  private rowToMessage(row: MemoryRow): Message {
    const metadata = this.parseMetadata(row.metadata)
    const timestamp = row.created_at instanceof Date ? row.created_at : new Date(row.created_at)

    return {
      role: row.role ?? 'assistant',
      content: row.content,
      metadata,
      timestamp,
    } satisfies Message
  }

  private parseMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (metadata == null) {
      return undefined
    }

    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata) as Record<string, unknown>
      }
      catch {
        return { raw: metadata }
      }
    }

    if (typeof metadata === 'object') {
      return metadata as Record<string, unknown>
    }

    return undefined
  }

  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`
  }

  private validateTableName(name: string): string {
    if (!/^[_a-z]\w*$/i.test(name)) {
      throw new Error(`Invalid table name for PostgresPgvectorMemoryProvider: ${name}`)
    }

    return name
  }

  private resolveEmbeddingConfiguration(
    config: EmbeddingProviderConfiguration | undefined,
    explicitModel?: string,
    explicitApiKey?: string,
  ): EmbeddingProviderConfiguration {
    const provider = config?.provider
      ?? (env.MEMORY_EMBEDDING_PROVIDER as EmbeddingProviderConfiguration['provider'] | undefined)
      ?? 'openai'

    const apiKey = config?.apiKey
      ?? explicitApiKey
      ?? env.MEMORY_EMBEDDING_API_KEY
      ?? env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error('An embedding API key is required.')
    }

    const model = config?.model
      ?? explicitModel
      ?? env.MEMORY_EMBEDDING_MODEL
      ?? DEFAULT_EMBEDDING_MODEL

    const baseUrl = config?.baseUrl ?? env.MEMORY_EMBEDDING_BASE_URL
    const accountId = config?.accountId ?? env.CLOUDFLARE_ACCOUNT_ID

    if (provider === 'cloudflare' && !accountId) {
      throw new Error('Cloudflare embedding provider requires an account ID.')
    }

    return {
      provider,
      apiKey,
      model,
      baseUrl,
      accountId,
    } satisfies EmbeddingProviderConfiguration
  }

  private async generateCloudflareEmbedding(input: string): Promise<number[]> {
    const accountId = this.embeddingConfig.accountId
    if (!accountId) {
      throw new Error('Cloudflare account ID is not configured.')
    }

    const url = `${this.embeddingConfig.baseUrl ?? 'https://api.cloudflare.com/client/v4'}/accounts/${accountId}/ai/run/${this.embeddingConfig.model}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.embeddingConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: input }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Cloudflare embedding request failed: ${response.status} ${body}`)
    }

    const payload = await response.json() as Record<string, any>
    const embedding = this.extractCloudflareEmbedding(payload)

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Cloudflare embedding response did not include an embedding vector.')
    }

    return embedding.map((value: number | string) => Number(value))
  }

  private extractCloudflareEmbedding(payload: Record<string, any>): number[] | undefined {
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
}
