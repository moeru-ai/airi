import type { IMemoryProvider, MemorySearchResult, Message } from '../../interfaces/memory.interface'
import type { EmbeddingProviderConfiguration } from '../../types/config'

import { randomUUID } from 'node:crypto'
import { env } from 'node:process'

import OpenAI from 'openai'

import { QdrantClient } from '@qdrant/js-client-rest'

const DEFAULT_COLLECTION_NAME = 'memory_entries'
const DEFAULT_VECTOR_SIZE = 1536
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

export interface QdrantMemoryOptions {
  url?: string
  apiKey?: string
  client?: QdrantClient
  collectionName?: string
  vectorSize?: number
  embedding?: EmbeddingProviderConfiguration
}

interface QdrantPayload {
  userId: string
  sessionId?: string | null
  role: string
  content: string
  metadata?: Record<string, unknown> | null
  timestamp: string
}

export class QdrantMemoryProvider implements IMemoryProvider {
  private readonly client: QdrantClient
  private readonly collectionName: string
  private readonly vectorSize: number
  private readonly embeddingConfig: EmbeddingProviderConfiguration
  private readonly openai: OpenAI | null

  constructor(private readonly options: QdrantMemoryOptions = {}) {
    if (!options.client && !options.url) {
      throw new Error('QdrantMemoryProvider requires either an existing client or a URL.')
    }

    this.client = options.client ?? new QdrantClient({
      url: options.url!,
      apiKey: options.apiKey,
    })

    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION_NAME
    this.vectorSize = options.vectorSize ?? DEFAULT_VECTOR_SIZE
    this.embeddingConfig = this.resolveEmbeddingConfiguration(options.embedding)

    this.openai = this.embeddingConfig.provider === 'cloudflare'
      ? null
      : new OpenAI({ apiKey: this.embeddingConfig.apiKey, baseURL: this.embeddingConfig.baseUrl })
  }

  async initialize(): Promise<void> {
    try {
      await this.client.getCollection(this.collectionName)
    }
    catch {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.vectorSize,
          distance: 'Cosine',
        },
      })
    }
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const derivedUserId = this.extractUserId(message)
    if (!derivedUserId) {
      return
    }

    const metadata = {
      ...message.metadata,
      sessionId,
    } as Record<string, unknown>

    await this.saveLongTermMemory({ ...message, metadata }, derivedUserId)
  }

  async getRecentMessages(sessionId: string, limit = 50): Promise<Message[]> {
    const points: Message[] = []
    let offset: string | undefined

    do {
      const response = await this.client.scroll(this.collectionName, {
        with_payload: true,
        with_vectors: false,
        limit,
        offset,
        filter: {
          must: [
            {
              key: 'sessionId',
              match: { value: sessionId },
            },
          ],
        },
      })

      const batch = (response.points ?? []).map(point => this.payloadToMessage(point.payload as QdrantPayload | undefined))
      points.push(...batch)
      offset = response.next_page_offset ?? undefined
    } while (offset && points.length < limit)

    return points
      .filter((message): message is Message => Boolean(message))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .reverse()
  }

  async searchSimilar(query: string, userId: string, limit = 10): Promise<MemorySearchResult[]> {
    const embedding = await this.generateEmbedding(query)

    const results = await this.client.search(this.collectionName, {
      vector: embedding,
      limit,
      with_payload: true,
      filter: {
        must: [
          {
            key: 'userId',
            match: { value: userId },
          },
        ],
      },
    })

    return (results ?? [])
      .map((item) => {
        const message = this.payloadToMessage(item.payload as QdrantPayload | undefined)
        if (!message) {
          return null
        }

        return {
          message,
          similarity: typeof item.score === 'number' ? item.score : 0,
          timestamp: message.timestamp,
          metadata: message.metadata,
        } satisfies MemorySearchResult
      })
      .filter((entry): entry is MemorySearchResult => Boolean(entry))
  }

  async saveLongTermMemory(message: Message, userId: string): Promise<void> {
    const embedding = await this.generateEmbedding(message.content)
    const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp)
    const sessionId = this.extractSessionId(message)

    const payload: QdrantPayload = {
      userId,
      sessionId: sessionId ?? undefined,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? undefined,
      timestamp: timestamp.toISOString(),
    }

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id: randomUUID(),
          vector: embedding,
          payload,
        },
      ],
    })
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      filter: {
        must: [
          {
            key: 'sessionId',
            match: { value: sessionId },
          },
        ],
      },
    })
  }

  private payloadToMessage(payload: QdrantPayload | undefined): Message | null {
    if (!payload) {
      return null
    }

    return {
      role: payload.role ?? 'assistant',
      content: payload.content,
      metadata: payload.metadata ?? undefined,
      timestamp: new Date(payload.timestamp ?? Date.now()),
    } satisfies Message
  }

  private async generateEmbedding(input: string): Promise<number[]> {
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      return Array.from({ length: this.vectorSize }, () => 0)
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
        model: this.embeddingConfig.model ?? DEFAULT_EMBEDDING_MODEL,
        input: trimmed,
      })

      embedding = response.data?.[0]?.embedding ?? []
    }

    if (!embedding.length) {
      throw new Error('Failed to generate embedding for memory content.')
    }

    if (embedding.length !== this.vectorSize) {
      throw new Error(`Embedding dimension mismatch. Expected ${this.vectorSize}, received ${embedding.length}.`)
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

  private resolveEmbeddingConfiguration(
    config?: EmbeddingProviderConfiguration,
  ): EmbeddingProviderConfiguration {
    const provider = config?.provider
      ?? (env.MEMORY_EMBEDDING_PROVIDER as EmbeddingProviderConfiguration['provider'] | undefined)
      ?? 'openai'

    const apiKey = config?.apiKey
      ?? env.MEMORY_EMBEDDING_API_KEY
      ?? env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error('An embedding API key is required.')
    }

    const model = config?.model
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

    const url = `${this.embeddingConfig.baseUrl ?? 'https://api.cloudflare.com/client/v4'}/accounts/${accountId}/ai/run/${this.embeddingConfig.model ?? DEFAULT_EMBEDDING_MODEL}`

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
