export type ShortTermProviderType = 'vercel-kv' | 'upstash-redis' | 'local-redis'

export interface ShortTermProviderConfiguration {
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

export type LongTermProviderType = 'postgres-pgvector' | 'qdrant'

export type EmbeddingProviderType = 'openai' | 'openai-compatible' | 'cloudflare'

export interface EmbeddingProviderConfiguration {
  provider: EmbeddingProviderType
  apiKey: string
  model: string
  baseUrl?: string
  accountId?: string
}

export interface PostgresConnectionConfiguration {
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  ssl?: boolean
}

export interface QdrantConnectionConfiguration {
  url: string
  apiKey?: string
  collectionName: string
  vectorSize?: number
}

export interface BaseLongTermConfiguration {
  enabled: boolean
  embedding?: EmbeddingProviderConfiguration
}

export interface PostgresLongTermConfiguration extends BaseLongTermConfiguration {
  provider: 'postgres-pgvector'
  connection: PostgresConnectionConfiguration
}

export interface QdrantLongTermConfiguration extends BaseLongTermConfiguration {
  provider: 'qdrant'
  qdrant: QdrantConnectionConfiguration
}

export type LongTermProviderConfiguration = PostgresLongTermConfiguration | QdrantLongTermConfiguration

export interface MemoryConfiguration {
  shortTerm: ShortTermProviderConfiguration
  longTerm?: LongTermProviderConfiguration
}
