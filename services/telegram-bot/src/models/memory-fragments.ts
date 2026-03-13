import type { SQL } from 'drizzle-orm'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { embed } from '@xsai/embed'
import { and, cosineDistance, desc, eq, gt, isNull, sql } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { memoryFragmentsTable } from '../db/schema'

export type MemoryFragment = typeof memoryFragmentsTable.$inferSelect

export interface MemoryMetadata {
  platform: 'telegram'
  botId: string
  chatId: string
  sourceMessageIds: string[]
  sourceType: 'conversation'
  extractedAt: number
}

function getVectorColumn() {
  switch (env.EMBEDDING_DIMENSION) {
    case '1536':
      return memoryFragmentsTable.content_vector_1536
    case '1024':
      return memoryFragmentsTable.content_vector_1024
    case '768':
      return memoryFragmentsTable.content_vector_768
    default:
      throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
  }
}

function buildSimilarity(embedding: number[]): SQL<number> {
  return sql<number>`(1 - (${cosineDistance(getVectorColumn(), embedding)}))`
}

export async function embedContent(content: string): Promise<number[]> {
  const result = await embed({
    baseURL: env.EMBEDDING_API_BASE_URL!,
    apiKey: env.EMBEDDING_API_KEY!,
    model: env.EMBEDDING_MODEL!,
    input: content,
  })
  return result.embedding
}

/**
 * Find semantically relevant long-term memories for a given embedding.
 */
export async function findRelevantLongTermMemories(opts: {
  embedding: number[]
  limit?: number
  similarityThreshold?: number
}): Promise<(MemoryFragment & { similarity: number, combined_score: number })[]> {
  const db = useDrizzle()
  const logger = useLogg('findRelevantLongTermMemories').useGlobalConfig()
  const { embedding, limit = 5, similarityThreshold = 0.5 } = opts

  const similarity = buildSimilarity(embedding)
  const timeRelevance = sql<number>`(1 - (CEIL(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint - ${memoryFragmentsTable.created_at}) / 86400 / 30)`
  const normalizedImportance = sql<number>`(${memoryFragmentsTable.importance}::float / 10)`
  const combinedScore = sql<number>`((1.0 * ${similarity}) + (0.2 * ${timeRelevance}) + (0.3 * ${normalizedImportance}))`

  const results = await db
    .select({
      id: memoryFragmentsTable.id,
      content: memoryFragmentsTable.content,
      memory_type: memoryFragmentsTable.memory_type,
      category: memoryFragmentsTable.category,
      importance: memoryFragmentsTable.importance,
      emotional_impact: memoryFragmentsTable.emotional_impact,
      created_at: memoryFragmentsTable.created_at,
      last_accessed: memoryFragmentsTable.last_accessed,
      access_count: memoryFragmentsTable.access_count,
      metadata: memoryFragmentsTable.metadata,
      content_vector_1536: memoryFragmentsTable.content_vector_1536,
      content_vector_1024: memoryFragmentsTable.content_vector_1024,
      content_vector_768: memoryFragmentsTable.content_vector_768,
      deleted_at: memoryFragmentsTable.deleted_at,
      similarity: sql<number>`${similarity}`.as('similarity'),
      combined_score: sql<number>`${combinedScore}`.as('combined_score'),
    })
    .from(memoryFragmentsTable)
    .where(and(
      eq(memoryFragmentsTable.memory_type, 'long_term'),
      isNull(memoryFragmentsTable.deleted_at),
      gt(similarity, similarityThreshold),
    ))
    .orderBy(desc(sql`combined_score`))
    .limit(limit)

  logger.withField('count', results.length).log('Found relevant long-term memories')
  return results as (MemoryFragment & { similarity: number, combined_score: number })[]
}

/**
 * Find a semantically duplicate memory to avoid storing redundant entries.
 */
export async function findDuplicateLongTermMemory(opts: {
  embedding: number[]
  threshold?: number
}): Promise<MemoryFragment | null> {
  const db = useDrizzle()
  const { embedding, threshold = 0.92 } = opts

  const similarity = buildSimilarity(embedding)

  const results = await db
    .select()
    .from(memoryFragmentsTable)
    .where(and(
      eq(memoryFragmentsTable.memory_type, 'long_term'),
      isNull(memoryFragmentsTable.deleted_at),
      gt(similarity, threshold),
    ))
    .orderBy(desc(similarity))
    .limit(1)

  return results[0] ?? null
}

/**
 * Merge into existing memory or create a new one with deduplication.
 */
export async function mergeOrCreateLongTermMemory(opts: {
  content: string
  category: string
  importance: number
  embedding: number[]
  metadata: MemoryMetadata
}): Promise<{ action: 'created' | 'merged', id: string }> {
  const db = useDrizzle()
  const logger = useLogg('mergeOrCreateLongTermMemory').useGlobalConfig()
  const { content, category, importance, embedding, metadata } = opts

  const duplicate = await findDuplicateLongTermMemory({ embedding })

  if (duplicate) {
    const oldMeta = (duplicate.metadata ?? {}) as Record<string, unknown>
    const oldSourceIds = Array.isArray(oldMeta.sourceMessageIds) ? oldMeta.sourceMessageIds as string[] : []
    const mergedSourceIds = [...new Set([...oldSourceIds, ...metadata.sourceMessageIds])]

    await db
      .update(memoryFragmentsTable)
      .set({
        last_accessed: Date.now(),
        access_count: duplicate.access_count + 1,
        importance: Math.max(duplicate.importance, importance),
        metadata: { ...oldMeta, ...metadata, sourceMessageIds: mergedSourceIds },
      })
      .where(eq(memoryFragmentsTable.id, duplicate.id))

    logger.withField('id', duplicate.id).log('Merged with existing memory')
    return { action: 'merged', id: duplicate.id }
  }

  const vectorValues: Record<string, unknown> = {}
  switch (env.EMBEDDING_DIMENSION) {
    case '1536':
      vectorValues.content_vector_1536 = embedding
      break
    case '1024':
      vectorValues.content_vector_1024 = embedding
      break
    case '768':
      vectorValues.content_vector_768 = embedding
      break
  }

  const [inserted] = await db
    .insert(memoryFragmentsTable)
    .values({
      content,
      memory_type: 'long_term',
      category,
      importance,
      metadata,
      ...vectorValues,
    })
    .returning({ id: memoryFragmentsTable.id })

  logger.withField('id', inserted.id).log('Created new long-term memory')
  return { action: 'created', id: inserted.id }
}

/**
 * Update access tracking when a memory is retrieved.
 */
export async function touchMemory(id: string): Promise<void> {
  const db = useDrizzle()
  await db
    .update(memoryFragmentsTable)
    .set({
      last_accessed: Date.now(),
      access_count: sql`${memoryFragmentsTable.access_count} + 1`,
    })
    .where(eq(memoryFragmentsTable.id, id))
}
