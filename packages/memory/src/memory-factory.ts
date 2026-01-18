import type { IMemoryProvider, Message } from './interfaces/memory.interface'
import type { PostgresPgvectorMemoryOptions, QdrantMemoryOptions } from './providers/long-term'
import type { LocalRedisShortTermMemoryOptions, UpstashRedisShortTermMemoryOptions, VercelKvShortTermMemoryOptions } from './providers/short-term'
import type { EmbeddingProviderConfiguration, LongTermProviderConfiguration, MemoryConfiguration, ShortTermProviderConfiguration } from './types/config'

import { env } from 'node:process'

import { PostgresPgvectorMemoryProvider, QdrantMemoryProvider } from './providers/long-term'
import { LocalRedisShortTermMemoryProvider, UpstashRedisShortTermMemoryProvider, VercelKvShortTermMemoryProvider } from './providers/short-term'

export interface MemorySystemFactoryOptions {
  shortTermProvider?: IMemoryProvider
  longTermProvider?: IMemoryProvider | null
  shortTermOptions?: VercelKvShortTermMemoryOptions | UpstashRedisShortTermMemoryOptions | LocalRedisShortTermMemoryOptions
  longTermOptions?: PostgresPgvectorMemoryOptions
  environment?: NodeJS.ProcessEnv
  onError?: (error: unknown, context: { operation: string, provider: 'short-term' | 'long-term', payload?: unknown }) => void
  configuration?: MemoryConfiguration
}

export interface CombinedMemoryProviderOptions {
  shortTerm: IMemoryProvider
  longTerm?: IMemoryProvider | null
  shouldPromoteMessage?: (message: Message) => boolean
  extractUserId?: (message: Message) => string | null
  onError?: (error: unknown, context: { operation: string, provider: 'short-term' | 'long-term', payload?: unknown }) => void
}

export class CombinedMemoryProvider implements IMemoryProvider {
  private readonly shortTerm: IMemoryProvider
  private readonly longTerm: IMemoryProvider | null
  private readonly shouldPromoteMessage: (message: Message) => boolean
  private readonly extractUserId: (message: Message) => string | null
  private readonly onError?: (error: unknown, context: { operation: string, provider: 'short-term' | 'long-term', payload?: unknown }) => void

  constructor(options: CombinedMemoryProviderOptions) {
    this.shortTerm = options.shortTerm
    this.longTerm = options.longTerm ?? null
    this.shouldPromoteMessage = options.shouldPromoteMessage ?? defaultShouldPromoteMessage
    this.extractUserId = options.extractUserId ?? defaultExtractUserId
    this.onError = options.onError
  }

  async initialize(): Promise<void> {
    await this.shortTerm.initialize()

    if (this.longTerm) {
      try {
        await this.longTerm.initialize()
      }
      catch (error) {
        this.handleError(error, { operation: 'initialize', provider: 'long-term' })
      }
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.shortTerm.addMessage(sessionId, message)

    if (!this.longTerm) {
      return
    }

    try {
      if (!this.shouldPromoteMessage(message)) {
        return
      }

      const userId = this.extractUserId(message)
      if (!userId) {
        return
      }

      await this.longTerm.saveLongTermMemory(message, userId)
    }
    catch (error) {
      this.handleError(error, { operation: 'promote', provider: 'long-term', payload: { sessionId, message } })
    }
  }

  async getRecentMessages(sessionId: string, limit?: number) {
    return this.shortTerm.getRecentMessages(sessionId, limit)
  }

  async searchSimilar(query: string, userId: string, limit?: number) {
    if (!this.longTerm) {
      return []
    }

    try {
      return await this.longTerm.searchSimilar(query, userId, limit)
    }
    catch (error) {
      this.handleError(error, { operation: 'search', provider: 'long-term', payload: { query, userId, limit } })
      return []
    }
  }

  async saveLongTermMemory(message: Message, userId: string): Promise<void> {
    if (!this.longTerm) {
      return
    }

    try {
      await this.longTerm.saveLongTermMemory(message, userId)
    }
    catch (error) {
      this.handleError(error, { operation: 'save', provider: 'long-term', payload: { message, userId } })
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.shortTerm.clearSession(sessionId)

    if (!this.longTerm) {
      return
    }

    try {
      await this.longTerm.clearSession(sessionId)
    }
    catch (error) {
      this.handleError(error, { operation: 'clear', provider: 'long-term', payload: { sessionId } })
    }
  }

  private handleError(error: unknown, context: { operation: string, provider: 'short-term' | 'long-term', payload?: unknown }) {
    if (this.onError) {
      this.onError(error, context)
      return
    }

    console.error(`[memory] ${context.provider} provider failed during ${context.operation}`, error)
  }
}

function defaultShouldPromoteMessage(message: Message): boolean {
  if (message.role === 'system') {
    return false
  }

  const metadata = message.metadata as Record<string, unknown> | undefined
  if (metadata && Object.prototype.hasOwnProperty.call(metadata, 'persistLongTerm')) {
    return Boolean(metadata.persistLongTerm)
  }

  return true
}

function defaultExtractUserId(message: Message): string | null {
  const metadata = message.metadata as Record<string, unknown> | undefined
  if (!metadata) {
    return null
  }

  const candidate = metadata.userId ?? metadata.userID ?? metadata.user_id
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

export class MemorySystemFactory {
  static create(options: MemorySystemFactoryOptions = {}): CombinedMemoryProvider {
    const envVars = options.environment ?? env

    const shortTerm = options.shortTermProvider
      ?? (options.configuration
        ? this.createShortTermFromConfig(options.configuration.shortTerm)
        : this.resolveShortTermProvider(envVars, options))

    const longTerm = options.longTermProvider
      ?? (options.configuration
        ? this.createLongTermFromConfig(options.configuration.longTerm, envVars, options)
        : this.resolveLongTermProvider(envVars, options))

    return new CombinedMemoryProvider({
      shortTerm,
      longTerm,
      onError: options.onError,
    })
  }

  private static createShortTermFromConfig(config: ShortTermProviderConfiguration): IMemoryProvider {
    const commonOptions = {
      namespace: config.namespace,
      maxMessages: config.maxMessages,
      ttlSeconds: config.ttlSeconds,
    } satisfies Partial<VercelKvShortTermMemoryOptions>

    switch (config.provider) {
      case 'upstash-redis':
        return new UpstashRedisShortTermMemoryProvider({
          ...commonOptions,
          url: config.upstash?.url,
          token: config.upstash?.token,
        })
      case 'local-redis':
        return new LocalRedisShortTermMemoryProvider({
          ...commonOptions,
          connection: {
            host: config.redis?.host,
            port: config.redis?.port,
            password: config.redis?.password,
          },
        })
      case 'vercel-kv':
      default:
        return new VercelKvShortTermMemoryProvider(commonOptions)
    }
  }

  private static resolveShortTermProvider(envVars: NodeJS.ProcessEnv, options: MemorySystemFactoryOptions): IMemoryProvider {
    const providerName = (envVars.MEMORY_PROVIDER || envVars.SHORT_TERM_MEMORY_PROVIDER || '').toLowerCase()

    if (providerName === 'upstash-redis') {
      return new UpstashRedisShortTermMemoryProvider(options.shortTermOptions as UpstashRedisShortTermMemoryOptions | undefined)
    }

    if (providerName === 'local-redis') {
      return new LocalRedisShortTermMemoryProvider(options.shortTermOptions as LocalRedisShortTermMemoryOptions | undefined)
    }

    if (providerName === 'vercel-kv') {
      return new VercelKvShortTermMemoryProvider(options.shortTermOptions as VercelKvShortTermMemoryOptions | undefined)
    }

    if (envVars.VERCEL_ENV) {
      return new VercelKvShortTermMemoryProvider(options.shortTermOptions as VercelKvShortTermMemoryOptions | undefined)
    }

    if ((envVars.UPSTASH_KV_REST_API_URL || envVars.UPSTASH_KV_URL || envVars.UPSTASH_REDIS_REST_URL)
      && (envVars.UPSTASH_KV_REST_API_TOKEN || envVars.UPSTASH_REDIS_REST_TOKEN)) {
      return new UpstashRedisShortTermMemoryProvider(options.shortTermOptions as UpstashRedisShortTermMemoryOptions | undefined)
    }

    return new LocalRedisShortTermMemoryProvider(options.shortTermOptions as LocalRedisShortTermMemoryOptions | undefined)
  }

  private static resolveLongTermProvider(envVars: NodeJS.ProcessEnv, options: MemorySystemFactoryOptions): IMemoryProvider | null {
    const providerName = (envVars.LONG_TERM_MEMORY_PROVIDER || envVars.MEMORY_LONG_TERM_PROVIDER || '').toLowerCase()

    if (providerName === 'none') {
      return null
    }

    if (providerName === 'qdrant') {
      const url = envVars.QDRANT_URL
      if (!url) {
        throw new Error('QDRANT_URL is required when using qdrant long-term provider.')
      }

      const embedding = this.resolveEmbeddingFromEnv(envVars)
      if (!embedding) {
        throw new Error('Embedding configuration is required for qdrant provider. Set MEMORY_EMBEDDING_API_KEY or OPENAI_API_KEY.')
      }

      return new QdrantMemoryProvider({
        url,
        apiKey: envVars.QDRANT_API_KEY,
        collectionName: envVars.QDRANT_COLLECTION ?? 'memory_entries',
        vectorSize: envVars.QDRANT_VECTOR_SIZE ? Number.parseInt(envVars.QDRANT_VECTOR_SIZE, 10) : undefined,
        embedding,
      })
    }

    if (providerName && providerName !== 'postgres-pgvector') {
      throw new Error(`Unsupported long-term memory provider: ${providerName}`)
    }

    const hasConnection = Boolean(envVars.POSTGRES_URL || envVars.POSTGRES_PRISMA_URL || envVars.DATABASE_URL || options.longTermOptions?.connectionString)
    const embedding = this.resolveEmbeddingFromEnv(envVars)
    if (!embedding || !hasConnection) {
      return null
    }

    return new PostgresPgvectorMemoryProvider({
      ...(options.longTermOptions ?? {}),
      connectionString: options.longTermOptions?.connectionString
        ?? envVars.POSTGRES_URL
        ?? envVars.POSTGRES_PRISMA_URL
        ?? envVars.DATABASE_URL,
      embedding,
    })
  }

  private static createLongTermFromConfig(
    config: LongTermProviderConfiguration | undefined,
    envVars: NodeJS.ProcessEnv,
    options: MemorySystemFactoryOptions,
  ): IMemoryProvider | null {
    if (!config || !config.enabled) {
      return null
    }

    if (config.provider !== 'postgres-pgvector') {
      throw new Error(`Unsupported long-term memory provider: ${config.provider}`)
    }

    const connectionString = config.connection.connectionString
      ?? (config.connection.host
        ? this.composePostgresConnectionString(config.connection)
        : undefined)
      ?? options.longTermOptions?.connectionString
      ?? envVars.POSTGRES_URL
      ?? envVars.POSTGRES_PRISMA_URL
      ?? envVars.DATABASE_URL

    if (config.provider === 'postgres-pgvector') {
      const longTermOptions: PostgresPgvectorMemoryOptions = {
        connectionString,
        embedding: config.embedding,
      }

      if (!longTermOptions.connectionString) {
        throw new Error('Postgres connection settings are required when enabling long-term memory.')
      }

      return new PostgresPgvectorMemoryProvider(longTermOptions)
    }

    if (config.provider === 'qdrant') {
      const qdrantConfig = config.qdrant
      if (!qdrantConfig?.url || !qdrantConfig.collectionName) {
        throw new Error('Qdrant configuration requires both url and collectionName.')
      }

      const options: QdrantMemoryOptions = {
        url: qdrantConfig.url,
        apiKey: qdrantConfig.apiKey,
        collectionName: qdrantConfig.collectionName ?? undefined,
        vectorSize: qdrantConfig.vectorSize ?? undefined,
        embedding: config.embedding,
      }

      return new QdrantMemoryProvider(options)
    }

    throw new Error(`Unsupported long-term memory provider: ${config.provider satisfies never}`)
  }

  private static composePostgresConnectionString(connection: LongTermProviderConfiguration['connection']): string {
    const host = connection.host ?? 'localhost'
    const port = connection.port ?? 5432
    const database = connection.database ?? 'postgres'
    const user = connection.user ?? 'postgres'
    const password = connection.password ?? ''
    const ssl = connection.ssl ? '?sslmode=require' : ''
    if (password) {
      return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}${ssl}`
    }

    return `postgres://${user}@${host}:${port}/${database}${ssl}`
  }

  private static resolveEmbeddingFromEnv(envVars: NodeJS.ProcessEnv): EmbeddingProviderConfiguration | undefined {
    const provider = (envVars.MEMORY_EMBEDDING_PROVIDER || envVars.EMBEDDING_PROVIDER) as EmbeddingProviderConfiguration['provider'] | undefined ?? 'openai'
    const apiKey = envVars.MEMORY_EMBEDDING_API_KEY ?? envVars.OPENAI_API_KEY ?? undefined

    if (!apiKey && provider !== 'cloudflare') {
      return undefined
    }

    return {
      provider,
      apiKey,
      model: envVars.MEMORY_EMBEDDING_MODEL ?? envVars.EMBEDDING_MODEL,
      baseUrl: envVars.MEMORY_EMBEDDING_BASE_URL ?? envVars.OPENAI_BASE_URL,
      accountId: envVars.CLOUDFLARE_ACCOUNT_ID,
      apiToken: envVars.CLOUDFLARE_API_TOKEN,
    } satisfies EmbeddingProviderConfiguration
  }
}
