import type { Client, InValue } from '@libsql/client'

import type { MessageHistoryRow } from '../db/message-history-repo.js'
import type { EmbeddingProvider } from './embedding-provider.js'

import { createLogger } from '../utils/logger.js'

const logger = createLogger('semantic-retriever')

export class SemanticRetriever {
  private vectorQueryAvailable: boolean | undefined

  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly db: Client,
  ) {}

  /**
   * 语义检索：对 query 做 embedding，返回 topK 条最相关的历史消息。
   * 排除 excludeIds（已在时序窗口中的消息）。
   */
  async findRelevant(
    sessionId: string,
    query: string,
    topK: number,
    excludeIds: number[] = [],
  ): Promise<MessageHistoryRow[]> {
    const trimmed = query.trim()
    if (!trimmed || topK <= 0)
      return []

    const queryEmbedding = await this.embeddingProvider.embed(trimmed)

    // 优先尝试 sqlite-vec 检索；若当前环境不可用则自动回退到 JS 暴力 KNN。
    const vecResult = await this.findRelevantWithVec(sessionId, queryEmbedding, topK, excludeIds)
    if (vecResult)
      return vecResult

    return await this.findRelevantByScan(sessionId, queryEmbedding, topK, excludeIds)
  }

  /**
   * 异步为新消息生成 embedding 并存储。
   * 在 PassiveRecordStage 的 DB 写入后触发。
   */
  async embedAndStore(messageId: number, text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed)
      return

    const embedding = await this.embeddingProvider.embed(trimmed)
    if (embedding.length !== this.embeddingProvider.dimension) {
      logger.warn(
        `Embedding dimension mismatch, expected=${this.embeddingProvider.dimension}, actual=${embedding.length}, messageId=${messageId}`,
      )
      return
    }

    const embeddingJson = JSON.stringify(embedding)

    await this.db.execute({
      sql: `INSERT INTO message_embeddings_cache (message_id, embedding)
            VALUES (?, ?)
            ON CONFLICT(message_id)
            DO UPDATE SET embedding = excluded.embedding`,
      args: [messageId, embeddingJson],
    })

    await this.insertIntoVecTable(messageId, embedding)
  }

  private async findRelevantWithVec(
    sessionId: string,
    queryEmbedding: number[],
    topK: number,
    excludeIds: number[],
  ): Promise<MessageHistoryRow[] | null> {
    if (this.vectorQueryAvailable === false)
      return null

    const candidateK = Math.max(topK * 8, 40)

    try {
      const queryVector = this.toVecJson(queryEmbedding)
      const result = await this.db.execute({
        sql: `SELECT message_id, distance
              FROM message_embeddings
              WHERE embedding MATCH ?
                AND k = ?
              ORDER BY distance ASC
              LIMIT ?`,
        args: [queryVector, candidateK, candidateK],
      })

      this.vectorQueryAvailable = true

      const rankedIds = result.rows
        .map((row) => {
          const record = row as Record<string, InValue>
          return {
            id: Number(record.message_id),
            distance: Number(record.distance),
          }
        })
        .filter(item => Number.isFinite(item.id))

      if (rankedIds.length === 0)
        return []

      const allowedRows = await this.getRowsByIds(sessionId, rankedIds.map(item => item.id), excludeIds)
      const rowById = new Map(allowedRows.map(row => [row.id, row]))

      return rankedIds
        .map(item => rowById.get(item.id))
        .filter((row): row is MessageHistoryRow => Boolean(row))
        .slice(0, topK)
    }
    catch (error) {
      logger.warn('sqlite-vec query is unavailable, fallback to brute-force semantic retrieval', {
        error: error instanceof Error ? error.message : String(error),
      })
      this.vectorQueryAvailable = false
      return null
    }
  }

  private async findRelevantByScan(
    sessionId: string,
    queryEmbedding: number[],
    topK: number,
    excludeIds: number[],
  ): Promise<MessageHistoryRow[]> {
    const args: InValue[] = [sessionId]

    let sql = `SELECT mh.id, mh.session_id, mh.sender_id, mh.sender_name, mh.content, mh.raw_text, mh.created_at, mec.embedding
               FROM message_history mh
               INNER JOIN message_embeddings_cache mec ON mec.message_id = mh.id
               WHERE mh.session_id = ?`

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(', ')
      sql += ` AND mh.id NOT IN (${placeholders})`
      args.push(...excludeIds)
    }

    // 限制候选集大小，避免在极端长会话里全量扫描。
    const candidateLimit = Math.max(topK * 40, 120)
    sql += ' ORDER BY mh.created_at DESC LIMIT ?'
    args.push(candidateLimit)

    const result = await this.db.execute({ sql, args })
    const scored = result.rows
      .map((row) => {
        const record = row as Record<string, InValue>
        const embedding = this.parseEmbedding(record.embedding)
        if (!embedding)
          return null

        return {
          row: this.mapMessageHistoryRow(record),
          score: cosineSimilarity(queryEmbedding, embedding),
        }
      })
      .filter((item): item is { row: MessageHistoryRow, score: number } => Boolean(item))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)

    return scored.map(item => item.row)
  }

  private async getRowsByIds(sessionId: string, ids: number[], excludeIds: number[]): Promise<MessageHistoryRow[]> {
    if (ids.length === 0)
      return []

    const args: InValue[] = [sessionId, ...ids]
    const idPlaceholders = ids.map(() => '?').join(', ')

    let sql = `SELECT id, session_id, sender_id, sender_name, content, raw_text, created_at
               FROM message_history
               WHERE session_id = ?
                 AND id IN (${idPlaceholders})`

    if (excludeIds.length > 0) {
      const excludePlaceholders = excludeIds.map(() => '?').join(', ')
      sql += ` AND id NOT IN (${excludePlaceholders})`
      args.push(...excludeIds)
    }

    const result = await this.db.execute({ sql, args })
    return result.rows.map(row => this.mapMessageHistoryRow(row as Record<string, InValue>))
  }

  private async insertIntoVecTable(messageId: number, embedding: number[]): Promise<void> {
    if (this.vectorQueryAvailable === false)
      return

    try {
      const vector = this.toVecJson(embedding)

      await this.db.execute({
        sql: 'DELETE FROM message_embeddings WHERE message_id = ?',
        args: [messageId],
      })

      await this.db.execute({
        sql: 'INSERT INTO message_embeddings (message_id, embedding) VALUES (?, ?)',
        args: [messageId, vector],
      })

      this.vectorQueryAvailable = true
    }
    catch (error) {
      logger.warn('sqlite-vec table write is unavailable, fallback to cache-only embeddings', {
        error: error instanceof Error ? error.message : String(error),
      })
      this.vectorQueryAvailable = false
    }
  }

  private parseEmbedding(value: InValue): number[] | null {
    if (typeof value !== 'string')
      return null

    try {
      const parsed = JSON.parse(value) as unknown
      if (!Array.isArray(parsed))
        return null

      const embedding = parsed
        .map(item => Number(item))
        .filter(num => Number.isFinite(num))

      if (embedding.length !== this.embeddingProvider.dimension)
        return null

      return embedding
    }
    catch {
      return null
    }
  }

  private mapMessageHistoryRow(row: Record<string, InValue>): MessageHistoryRow {
    return {
      id: Number(row.id),
      sessionId: String(row.session_id),
      senderId: String(row.sender_id),
      senderName: row.sender_name != null ? String(row.sender_name) : null,
      content: String(row.content),
      rawText: row.raw_text != null ? String(row.raw_text) : null,
      createdAt: Number(row.created_at),
    }
  }

  private toVecJson(embedding: number[]): string {
    return `[${embedding.join(',')}]`
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0)
    return -1

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < left.length; index++) {
    const lv = left[index]
    const rv = right[index]
    dot += lv * rv
    leftNorm += lv * lv
    rightNorm += rv * rv
  }

  if (leftNorm === 0 || rightNorm === 0)
    return -1

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}
