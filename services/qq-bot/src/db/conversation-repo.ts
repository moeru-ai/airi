import type { Client, InValue } from '@libsql/client'

import { randomUUID } from 'node:crypto'

export interface Conversation {
  id: number
  conversationId: string
  sessionId: string
  title: string | null
  personaId: string | null
  content: string | null
  tokenUsage: number
  createdAt: number
  updatedAt: number
}

export interface ConversationUpdate {
  title?: string
  content?: string
  tokenUsage?: number
  personaId?: string
}

export class ConversationRepo {
  constructor(private readonly db: Client) {}

  async create(sessionId: string, personaId?: string): Promise<Conversation> {
    const conversationId = randomUUID()
    const now = Date.now()

    await this.db.execute({
      sql: `INSERT INTO conversations (conversation_id, session_id, persona_id, content, created_at, updated_at)
            VALUES (?, ?, ?, '[]', ?, ?)`,
      args: [conversationId, sessionId, personaId ?? null, now, now],
    })

    await this.db.execute({
      sql: `INSERT OR REPLACE INTO active_conversations (session_id, conversation_id)
            VALUES (?, ?)`,
      args: [sessionId, conversationId],
    })

    return (await this.getById(conversationId))!
  }

  async getCurrent(sessionId: string): Promise<Conversation | null> {
    const result = await this.db.execute({
      sql: `SELECT c.* FROM conversations c
            JOIN active_conversations ac ON ac.conversation_id = c.conversation_id
            WHERE ac.session_id = ?`,
      args: [sessionId],
    })

    if (result.rows.length <= 0)
      return null

    return this.mapRow(result.rows[0] as Record<string, InValue>)
  }

  async switchTo(sessionId: string, conversationId: string): Promise<void> {
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO active_conversations (session_id, conversation_id)
            VALUES (?, ?)`,
      args: [sessionId, conversationId],
    })
  }

  async update(conversationId: string, updates: ConversationUpdate): Promise<void> {
    const sets: string[] = ['updated_at = ?']
    const params: InValue[] = [Date.now()]

    if (updates.title !== undefined) {
      sets.push('title = ?')
      params.push(updates.title)
    }
    if (updates.content !== undefined) {
      sets.push('content = ?')
      params.push(updates.content)
    }
    if (updates.tokenUsage !== undefined) {
      sets.push('token_usage = ?')
      params.push(updates.tokenUsage)
    }
    if (updates.personaId !== undefined) {
      sets.push('persona_id = ?')
      params.push(updates.personaId)
    }

    params.push(conversationId)
    await this.db.execute({
      sql: `UPDATE conversations SET ${sets.join(', ')} WHERE conversation_id = ?`,
      args: params,
    })
  }

  async delete(conversationId: string): Promise<void> {
    await this.db.execute({
      sql: 'DELETE FROM active_conversations WHERE conversation_id = ?',
      args: [conversationId],
    })
    await this.db.execute({
      sql: 'DELETE FROM conversations WHERE conversation_id = ?',
      args: [conversationId],
    })
  }

  async list(sessionId: string): Promise<Conversation[]> {
    const result = await this.db.execute({
      sql: 'SELECT * FROM conversations WHERE session_id = ? ORDER BY updated_at DESC',
      args: [sessionId],
    })
    return result.rows.map(row => this.mapRow(row as Record<string, InValue>))
  }

  async getById(conversationId: string): Promise<Conversation | null> {
    const result = await this.db.execute({
      sql: 'SELECT * FROM conversations WHERE conversation_id = ?',
      args: [conversationId],
    })
    if (result.rows.length <= 0)
      return null
    return this.mapRow(result.rows[0] as Record<string, InValue>)
  }

  private mapRow(row: Record<string, InValue>): Conversation {
    return {
      id: Number(row.id),
      conversationId: String(row.conversation_id),
      sessionId: String(row.session_id),
      title: row.title != null ? String(row.title) : null,
      personaId: row.persona_id != null ? String(row.persona_id) : null,
      content: row.content != null ? String(row.content) : null,
      tokenUsage: Number(row.token_usage),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }
  }
}
