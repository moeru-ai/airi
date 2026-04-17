// src/pipeline/passive-record.ts
// ─────────────────────────────────────────────────────────────
// PassiveRecordStage：在 WakeStage 之前被动记录所有消息历史
// ─────────────────────────────────────────────────────────────

import type { SemanticRetriever } from '../context/semantic-retriever.js'
import type { MessageHistoryRepo, MessageHistoryRow } from '../db/message-history-repo.js'
import type { StageResult } from '../types/context.js'
import type { QQMessageEvent } from '../types/event.js'
import type { InputMessageSegment } from '../types/message.js'

import { serializeChain } from '../utils/chain-serializer.js'
import { MessageBuffer } from '../utils/message-buffer.js'
import { PipelineStage } from './stage.js'

export interface PassiveRecord {
  senderId: string
  senderName: string
  chain: InputMessageSegment[]
  timestamp: number
}

interface PassiveSessionEntry {
  buffer: MessageBuffer<PassiveRecord>
  lastActive: number
}

export interface PassiveRecordConfig {
  maxHistoryPerSession: number
  timeoutMs: number
}

export class PassiveRecordStage extends PipelineStage {
  readonly name = 'PassiveRecordStage'

  private readonly buffers = new Map<string, PassiveSessionEntry>()

  constructor(
    private readonly config: PassiveRecordConfig,
    private readonly repo: MessageHistoryRepo,
    private readonly semanticRetriever?: SemanticRetriever,
  ) {
    super()
    this.initLogger()
  }

  async execute(event: QQMessageEvent): Promise<StageResult> {
    const key = event.source.sessionId
    const now = Date.now()

    const entry = this.getOrCreateEntry(key)

    if (now - entry.lastActive > this.config.timeoutMs) {
      this.logger.debug(`Session timeout, clearing passive buffer: ${key}`)
      entry.buffer.clear()
    }

    entry.lastActive = now
    // 记录发送者和消息链，供 ContextInject/ProcessStage 组装可读历史上下文。
    const record: PassiveRecord = {
      senderId: event.source.userId,
      senderName: event.source.userName,
      chain: event.chain,
      timestamp: now,
    }
    entry.buffer.push(record)

    // NOTICE: DB 写入放入 setImmediate，避免阻塞 pipeline 热路径。
    const serialized = JSON.stringify(record.chain)
    const rawText = serializeChain(record.chain, record.senderName)
    setImmediate(() => {
      (async () => {
        const insertedId = await this.repo.insertAndGetId({
          sessionId: key,
          senderId: record.senderId,
          senderName: record.senderName,
          content: serialized,
          rawText,
        })

        if (this.semanticRetriever && rawText)
          await this.semanticRetriever.embedAndStore(insertedId, rawText)
      })().catch((err) => {
        this.logger.error('[passive-record] DB write failed', err as Error)
      })
    })

    return { action: 'continue' }
  }

  async preheat(knownSessionIds: string[]): Promise<void> {
    for (const sessionId of knownSessionIds) {
      const rows = await this.repo.getRecent(sessionId, this.config.maxHistoryPerSession)
      const entry = this.getOrCreateEntry(sessionId)

      for (const row of rows) {
        try {
          entry.buffer.push({
            senderId: row.senderId,
            senderName: row.senderName ?? 'Unknown',
            chain: JSON.parse(row.content) as InputMessageSegment[],
            timestamp: row.createdAt,
          })
        }
        catch (error) {
          this.logger.warn(`Failed to parse stored message history, id=${row.id}`, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      entry.lastActive = Date.now()
    }
  }

  getRecent(sessionId: string, n: number): PassiveRecord[] {
    const entry = this.buffers.get(sessionId)
    return entry ? entry.buffer.getRecent(n) : []
  }

  listActiveSessionIds(): string[] {
    const now = Date.now()
    const result: string[] = []

    for (const [sessionId, entry] of this.buffers.entries()) {
      if (now - entry.lastActive <= this.config.timeoutMs)
        result.push(sessionId)
    }

    return result
  }

  async getMessagesAfter(sessionId: string, lastMessageId: number, limit: number): Promise<MessageHistoryRow[]> {
    return await this.repo.getAfter(sessionId, lastMessageId, limit)
  }

  async getLatestMessageId(sessionId: string): Promise<number | undefined> {
    const rows = await this.repo.getRecent(sessionId, 1)
    return rows[0]?.id
  }

  clearSession(sessionId: string): void {
    this.buffers.delete(sessionId)
  }

  private getOrCreateEntry(sessionId: string): PassiveSessionEntry {
    let entry = this.buffers.get(sessionId)
    if (!entry) {
      entry = {
        buffer: new MessageBuffer<PassiveRecord>(this.config.maxHistoryPerSession),
        lastActive: Date.now(),
      }
      this.buffers.set(sessionId, entry)
    }
    return entry
  }
}
