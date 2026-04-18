import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useDuckDb } from './use-duck-db'

vi.mock('@proj-airi/drizzle-duckdb-wasm', () => ({
  drizzle: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue([]),
    $client: {
      close: vi.fn().mockResolvedValue(undefined),
    },
  })),
}))

// Mock the helper function
vi.mock('@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser', () => ({
  getImportUrlBundles: vi.fn().mockReturnValue([]),
}))

describe('useDuckDB (Singleton)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(drizzle).mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return the same instance on multiple calls', async () => {
    const { getDb, closeDb } = useDuckDb()

    const instance1 = await getDb()
    expect(instance1).toBeDefined()
    expect(vi.mocked(drizzle).mock.calls.length).toBe(1)

    const { getDb: getDb2 } = useDuckDb()
    const instance2 = await getDb2()

    expect(instance1).toBe(instance2)
    expect(vi.mocked(drizzle).mock.calls.length).toBe(1)

    closeDb() // manual reset of the singleton
  })

  it('should handle concurrent getDb calls without duplicate initialization', async () => {
    const { getDb, closeDb } = useDuckDb()

    const promise1 = getDb()
    const promise2 = getDb()

    const [instance1, instance2] = await Promise.all([promise1, promise2])

    expect(instance1).toBe(instance2)
    expect(vi.mocked(drizzle).mock.calls.length).toBe(1)

    closeDb()
  })

  it('should allow re-initialization after closeDb is called', async () => {
    const { getDb, closeDb, db } = useDuckDb()

    await getDb()
    const instance1 = db.value
    expect(vi.mocked(drizzle).mock.calls.length).toBe(1)

    await nextTick()
    const spy = vi.spyOn(await (instance1!.$client), 'close')
    await closeDb()
    expect(spy).toHaveBeenCalled()

    const { getDb: getDb2 } = useDuckDb()
    const instance2 = await getDb2()

    expect(instance1).not.toBe(instance2)
    expect(vi.mocked(drizzle).mock.calls.length).toBe(2)

    closeDb()
  })
})
