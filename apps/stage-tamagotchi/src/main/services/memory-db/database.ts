import type { MemoryEntry } from './schema'

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import Database from 'better-sqlite3'

import { app } from 'electron'

import { CREATE_TABLES_SQL } from './schema'

export class MemoryDatabase {
  private db: Database.Database | null = null
  private dbPath: string = ''

  constructor() {
    // Default path will be set on initialization
    this.dbPath = ''
  }

  /**
   * Initialize database with optional custom path
   */
  initialize(customPath?: string): void {
    if (customPath) {
      this.dbPath = customPath
    }
    else if (!this.dbPath) {
      // Only use app.getPath if dbPath hasn't been set
      this.dbPath = join(app.getPath('userData'), 'memory.db')
    }

    // Ensure directory exists
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Open/create database
    this.db = new Database(this.dbPath)

    // Create tables
    this.db.exec(CREATE_TABLES_SQL)
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Add a memory entry
   */
  addMemory(
    type: 'short-term' | 'long-term',
    content: string,
    metadata?: Record<string, any>,
    embedding?: number[],
  ): number {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const stmt = this.db.prepare(`
      INSERT INTO memories (type, content, timestamp, metadata, embedding)
      VALUES (?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      type,
      content,
      Date.now(),
      metadata ? JSON.stringify(metadata) : null,
      embedding ? JSON.stringify(embedding) : null,
    )

    return result.lastInsertRowid as number
  }

  /**
   * Get memories by type with optional limit
   */
  getMemories(type: 'short-term' | 'long-term', limit?: number): MemoryEntry[] {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    let sql = `SELECT * FROM memories WHERE type = ? ORDER BY timestamp DESC`
    if (limit) {
      sql += ` LIMIT ${limit}`
    }

    const stmt = this.db.prepare(sql)
    return stmt.all(type) as MemoryEntry[]
  }

  /**
   * Get recent memories (all types)
   */
  getRecentMemories(limit: number = 50): MemoryEntry[] {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const stmt = this.db.prepare(`
      SELECT * FROM memories 
      ORDER BY timestamp DESC 
      LIMIT ?
    `)
    return stmt.all(limit) as MemoryEntry[]
  }

  /**
   * Delete old short-term memories (keep only recent ones)
   */
  cleanupShortTermMemories(keepCount: number = 20): void {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const stmt = this.db.prepare(`
      DELETE FROM memories 
      WHERE type = 'short-term' 
      AND id NOT IN (
        SELECT id FROM memories 
        WHERE type = 'short-term' 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `)
    stmt.run(keepCount)
  }

  /**
   * Delete all memories
   */
  clearAllMemories(): void {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const stmt = this.db.prepare('DELETE FROM memories')
    stmt.run()
  }

  /**
   * Delete memories by type
   */
  clearMemoriesByType(type: 'short-term' | 'long-term'): void {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const stmt = this.db.prepare('DELETE FROM memories WHERE type = ?')
    stmt.run(type)
  }

  /**
   * Get database statistics
   */
  getStats(): { total: number, shortTerm: number, longTerm: number } {
    if (!this.db) {
      throw new Error('Database not initialized')
    }

    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories')
    const shortTermStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE type = ?')
    const longTermStmt = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE type = ?')

    const total = (totalStmt.get() as any).count
    const shortTerm = (shortTermStmt.get('short-term') as any).count
    const longTerm = (longTermStmt.get('long-term') as any).count

    return { total, shortTerm, longTerm }
  }

  /**
   * Get current database path
   */
  getDatabasePath(): string {
    return this.dbPath
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null
  }
}

let memoryDbInstance: MemoryDatabase | null = null

export function getMemoryDatabase(): MemoryDatabase {
  if (!memoryDbInstance) {
    memoryDbInstance = new MemoryDatabase()
  }
  return memoryDbInstance
}
