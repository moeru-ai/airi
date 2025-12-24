import { unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryDatabase } from './database'

describe('memoryDatabase', () => {
  let db: MemoryDatabase
  let testDbPath: string

  beforeEach(() => {
    testDbPath = join(tmpdir(), `test-memory-${Date.now()}.db`)
    db = new MemoryDatabase()
    db.initialize(testDbPath)
  })

  afterEach(() => {
    if (db.isInitialized()) {
      db.close()
    }
    try {
      unlinkSync(testDbPath)
    }
    catch {
      // Ignore errors if file doesn't exist
    }
  })

  describe('initialization', () => {
    it('should initialize database successfully', () => {
      expect(db.isInitialized()).toBe(true)
      expect(db.getDatabasePath()).toBe(testDbPath)
    })

    it('should create tables on initialization', () => {
      const stats = db.getStats()
      expect(stats).toEqual({ total: 0, shortTerm: 0, longTerm: 0 })
    })
  })

  describe('addMemory', () => {
    it('should add a short-term memory', () => {
      const id = db.addMemory('short-term', 'Test memory content')
      expect(id).toBeGreaterThan(0)

      const stats = db.getStats()
      expect(stats.shortTerm).toBe(1)
      expect(stats.total).toBe(1)
    })

    it('should add a long-term memory with metadata', () => {
      const metadata = { source: 'test', timestamp: Date.now() }
      const id = db.addMemory('long-term', 'Long-term memory', metadata)
      expect(id).toBeGreaterThan(0)

      const memories = db.getMemories('long-term')
      expect(memories).toHaveLength(1)
      expect(memories[0].content).toBe('Long-term memory')
      expect(JSON.parse(memories[0].metadata!)).toEqual(metadata)
    })

    it('should add memory with embedding', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4]
      const id = db.addMemory('long-term', 'Memory with embedding', undefined, embedding)
      expect(id).toBeGreaterThan(0)

      const memories = db.getMemories('long-term')
      expect(memories).toHaveLength(1)
      expect(JSON.parse(memories[0].embedding!)).toEqual(embedding)
    })
  })

  describe('getMemories', () => {
    beforeEach(() => {
      // Add test data
      db.addMemory('short-term', 'Short-term 1')
      db.addMemory('short-term', 'Short-term 2')
      db.addMemory('long-term', 'Long-term 1')
    })

    it('should retrieve short-term memories', () => {
      const memories = db.getMemories('short-term')
      expect(memories).toHaveLength(2)
      expect(memories.every(m => m.type === 'short-term')).toBe(true)
    })

    it('should retrieve long-term memories', () => {
      const memories = db.getMemories('long-term')
      expect(memories).toHaveLength(1)
      expect(memories[0].type).toBe('long-term')
    })

    it('should limit results when limit is provided', () => {
      const memories = db.getMemories('short-term', 1)
      expect(memories).toHaveLength(1)
    })
  })

  describe('getRecentMemories', () => {
    it('should retrieve recent memories of all types', () => {
      db.addMemory('short-term', 'Short-term 1')
      db.addMemory('long-term', 'Long-term 1')
      db.addMemory('short-term', 'Short-term 2')

      const memories = db.getRecentMemories(10)
      expect(memories).toHaveLength(3)
    })

    it('should order by timestamp descending', () => {
      db.addMemory('short-term', 'First')
      db.addMemory('short-term', 'Second')

      const memories = db.getRecentMemories(10)
      expect(memories[0].content).toBe('Second')
      expect(memories[1].content).toBe('First')
    })
  })

  describe('cleanupShortTermMemories', () => {
    it('should keep only specified number of recent short-term memories', () => {
      for (let i = 0; i < 10; i++) {
        db.addMemory('short-term', `Memory ${i}`)
      }

      db.cleanupShortTermMemories(5)

      const memories = db.getMemories('short-term')
      expect(memories).toHaveLength(5)
    })

    it('should not affect long-term memories', () => {
      db.addMemory('long-term', 'Long-term memory')
      for (let i = 0; i < 10; i++) {
        db.addMemory('short-term', `Short-term ${i}`)
      }

      db.cleanupShortTermMemories(5)

      const longTerm = db.getMemories('long-term')
      expect(longTerm).toHaveLength(1)
    })
  })

  describe('clearMemoriesByType', () => {
    beforeEach(() => {
      db.addMemory('short-term', 'Short-term')
      db.addMemory('long-term', 'Long-term')
    })

    it('should clear only short-term memories', () => {
      db.clearMemoriesByType('short-term')

      expect(db.getMemories('short-term')).toHaveLength(0)
      expect(db.getMemories('long-term')).toHaveLength(1)
    })

    it('should clear only long-term memories', () => {
      db.clearMemoriesByType('long-term')

      expect(db.getMemories('long-term')).toHaveLength(0)
      expect(db.getMemories('short-term')).toHaveLength(1)
    })
  })

  describe('clearAllMemories', () => {
    it('should clear all memories', () => {
      db.addMemory('short-term', 'Short-term')
      db.addMemory('long-term', 'Long-term')

      db.clearAllMemories()

      const stats = db.getStats()
      expect(stats).toEqual({ total: 0, shortTerm: 0, longTerm: 0 })
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      db.addMemory('short-term', 'Short-term 1')
      db.addMemory('short-term', 'Short-term 2')
      db.addMemory('long-term', 'Long-term 1')

      const stats = db.getStats()
      expect(stats).toEqual({
        total: 3,
        shortTerm: 2,
        longTerm: 1,
      })
    })
  })

  describe('exportDatabase', () => {
    it('should export database as a buffer', () => {
      db.addMemory('short-term', 'Test memory 1')
      db.addMemory('long-term', 'Test memory 2')

      const buffer = db.exportDatabase()
      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(0)
    })

    it('should throw error if database is not initialized', () => {
      const uninitializedDb = new MemoryDatabase()
      expect(() => uninitializedDb.exportDatabase()).toThrow('Database not initialized')
    })

    it('should export a valid SQLite database', () => {
      db.addMemory('short-term', 'Test memory')
      const buffer = db.exportDatabase()

      // Check for SQLite file header (first 16 bytes should be "SQLite format 3\0")
      const header = buffer.toString('utf-8', 0, 15)
      expect(header).toBe('SQLite format 3')
    })
  })
})
