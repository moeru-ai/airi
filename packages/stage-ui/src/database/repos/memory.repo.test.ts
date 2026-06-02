import type { MemoryRecord, MemoryScope } from '../../types/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Swap the IDB-backed storage for an in-memory driver; the repo behaves identically regardless of
// the underlying driver (same as chat-sessions.repo.test.ts).
vi.mock('../storage', () => ({
  storage: createStorage({ driver: memoryDriver() }),
}))

const { memoryRepo } = await import('./memory.repo')
const { storage } = await import('../storage')

const SCOPE: MemoryScope = { character: 'airi', userId: 'local' }
const OTHER_SCOPE: MemoryScope = { character: 'airi', userId: 'someone-else' }

function makeRecord(id: string, embedding: number[], overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id,
    character: SCOPE.character,
    userId: SCOPE.userId,
    text: `memory ${id}`,
    type: 'fact',
    embedding,
    salience: 1,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

beforeEach(async () => {
  await storage.clear()
})

describe('memoryRepo insert/get/list/count', () => {
  /**
   * @example
   * insert then get returns the stored record; count/list reflect it.
   */
  it('persists a record and reads it back', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0]))

    expect(await memoryRepo.get(SCOPE, 'a')).toMatchObject({ id: 'a', text: 'memory a' })
    expect(await memoryRepo.count(SCOPE)).toBe(1)
    expect((await memoryRepo.list(SCOPE)).map(r => r.id)).toEqual(['a'])
  })

  /**
   * @example
   * get of an unknown id → null (never throws).
   */
  it('returns null for a missing id', async () => {
    expect(await memoryRepo.get(SCOPE, 'nope')).toBeNull()
  })

  /**
   * @example
   * A record in one scope is invisible to another scope's get/list/count.
   */
  it('isolates records by scope', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0]))

    expect(await memoryRepo.get(OTHER_SCOPE, 'a')).toBeNull()
    expect(await memoryRepo.count(OTHER_SCOPE)).toBe(0)
    expect(await memoryRepo.list(OTHER_SCOPE)).toEqual([])
  })

  /**
   * @example
   * Re-inserting the same id overwrites in place without duplicating the index entry.
   */
  it('insert is idempotent on id', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0], { text: 'first' }))
    await memoryRepo.insert(makeRecord('a', [1, 0, 0], { text: 'second' }))

    expect(await memoryRepo.count(SCOPE)).toBe(1)
    expect((await memoryRepo.get(SCOPE, 'a'))?.text).toBe('second')
  })
})

describe('memoryRepo search', () => {
  beforeEach(async () => {
    await memoryRepo.insert(makeRecord('same', [1, 0, 0])) // cos 1.0 vs query
    await memoryRepo.insert(makeRecord('diag', [1, 1, 0])) // cos ~0.707
    await memoryRepo.insert(makeRecord('orth', [0, 1, 0])) // cos 0.0
  })

  /**
   * @example
   * Search orders hits by descending cosine similarity to the query.
   */
  it('ranks by cosine similarity, highest first', async () => {
    const hits = await memoryRepo.search(SCOPE, { embedding: [1, 0, 0], k: 10 })

    expect(hits.map(h => h.record.id)).toEqual(['same', 'diag', 'orth'])
    expect(hits[0].similarity).toBeCloseTo(1, 5)
    expect(hits[1].similarity).toBeCloseTo(Math.SQRT1_2, 5)
    expect(hits[2].similarity).toBeCloseTo(0, 5)
  })

  /**
   * @example
   * k caps the number of hits returned.
   */
  it('limits results to k', async () => {
    const hits = await memoryRepo.search(SCOPE, { embedding: [1, 0, 0], k: 2 })
    expect(hits.map(h => h.record.id)).toEqual(['same', 'diag'])
  })

  /**
   * @example
   * minSimilarity drops hits below the threshold.
   */
  it('drops hits below minSimilarity', async () => {
    const hits = await memoryRepo.search(SCOPE, { embedding: [1, 0, 0], k: 10, minSimilarity: 0.5 })
    expect(hits.map(h => h.record.id)).toEqual(['same', 'diag'])
  })

  /**
   * @example
   * Searching an empty scope returns no hits.
   */
  it('returns nothing for an empty scope', async () => {
    expect(await memoryRepo.search(OTHER_SCOPE, { embedding: [1, 0, 0], k: 5 })).toEqual([])
  })
})

describe('memoryRepo update/delete/clear', () => {
  /**
   * @example
   * update patches mutable fields and bumps updatedAt while keeping id + scope.
   */
  it('updates salience and preserves identity', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0], { salience: 1, updatedAt: 1000 }))
    await memoryRepo.update(SCOPE, 'a', { salience: 5, lastRecalledAt: 2000 })

    const updated = await memoryRepo.get(SCOPE, 'a')
    expect(updated?.salience).toBe(5)
    expect(updated?.lastRecalledAt).toBe(2000)
    expect(updated?.id).toBe('a')
    expect(updated?.updatedAt).toBeGreaterThan(1000)
  })

  /**
   * @example
   * update of a missing id is a no-op (no throw, no insert).
   */
  it('update of a missing id does nothing', async () => {
    await memoryRepo.update(SCOPE, 'ghost', { salience: 9 })
    expect(await memoryRepo.count(SCOPE)).toBe(0)
  })

  /**
   * @example
   * delete removes the record and its index entry.
   */
  it('deletes a record and drops it from the index', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0]))
    await memoryRepo.insert(makeRecord('b', [0, 1, 0]))

    await memoryRepo.delete(SCOPE, 'a')

    expect(await memoryRepo.get(SCOPE, 'a')).toBeNull()
    expect(await memoryRepo.count(SCOPE)).toBe(1)
    expect((await memoryRepo.list(SCOPE)).map(r => r.id)).toEqual(['b'])
  })

  /**
   * @example
   * clear empties a scope entirely.
   */
  it('clears every record in a scope', async () => {
    await memoryRepo.insert(makeRecord('a', [1, 0, 0]))
    await memoryRepo.insert(makeRecord('b', [0, 1, 0]))

    await memoryRepo.clear(SCOPE)

    expect(await memoryRepo.count(SCOPE)).toBe(0)
    expect(await memoryRepo.list(SCOPE)).toEqual([])
  })
})
