import type { Client, InValue } from '@libsql/client'

export interface MessageHistoryRow {
  id: number
  sessionId: string
  senderId: string
  senderName: string | null
  content: string
  rawText: string | null
  createdAt: number
}

export class MessageHistoryRepo {
  constructor(private readonly db: Client) {}

  async insertAndGetId(record: {
    sessionId: string
    senderId: string
    senderName?: string
    content: string
    rawText?: string
  }): Promise<number> {
    const result = await this.db.execute({
      sql: `INSERT INTO message_history (session_id, sender_id, sender_name, content, raw_text)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        record.sessionId,
        record.senderId,
        record.senderName ?? null,
        record.content,
        record.rawText ?? null,
      ],
    })

    return Number(result.lastInsertRowid)
  }

  async insert(record: {
    sessionId: string
    senderId: string
    senderName?: string
    content: string
    rawText?: string
  }): Promise<void> {
    await this.db.execute({
      sql: `INSERT INTO message_history (session_id, sender_id, sender_name, content, raw_text)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        record.sessionId,
        record.senderId,
        record.senderName ?? null,
        record.content,
        record.rawText ?? null,
      ],
    })
  }

  async getRecent(sessionId: string, limit: number): Promise<MessageHistoryRow[]> {
    const result = await this.db.execute({
      sql: `SELECT id, session_id, sender_id, sender_name, content, raw_text, created_at
            FROM message_history
            WHERE session_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
      args: [sessionId, limit],
    })

    return result.rows.map(row => this.mapRow(row as Record<string, InValue>)).reverse()
  }

  async getAfter(sessionId: string, afterId: number, limit: number): Promise<MessageHistoryRow[]> {
    const result = await this.db.execute({
      sql: `SELECT id, session_id, sender_id, sender_name, content, raw_text, created_at
            FROM message_history
            WHERE session_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?`,
      args: [sessionId, afterId, limit],
    })

    return result.rows.map(row => this.mapRow(row as Record<string, InValue>))
  }

  async prune(sessionId: string, keepCount: number): Promise<number> {
    const result = await this.db.execute({
      sql: `DELETE FROM message_history
            WHERE session_id = ? AND id NOT IN (
              SELECT id FROM message_history
              WHERE session_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT ?
            )`,
      args: [sessionId, sessionId, keepCount],
    })
    return result.rowsAffected
  }

  async listSessionIds(): Promise<string[]> {
    const result = await this.db.execute('SELECT DISTINCT session_id FROM message_history')
    return result.rows.map(row => String((row as Record<string, InValue>).session_id))
  }

  private mapRow(row: Record<string, InValue>): MessageHistoryRow {
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
}
