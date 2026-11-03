import { sql } from 'drizzle-orm'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { mockDB } from './mock-db'

describe('mockDB', () => {
  it('registers the pgvector extension', async () => {
    const db = await mockDB({})

    // ROOT CAUSE:
    //
    // PGlite 0.5 moved pgvector from the main package to a separate package.
    // The old subpath import prevents this test database from loading.
    //
    // The helper now registers the separate extension before it creates the schema.
    const result = await db.execute<{ distance: number }>(sql`
      SELECT '[1, 2, 3]'::vector <-> '[1, 2, 4]'::vector AS distance
    `)

    expect(result.rows).toEqual([{ distance: 1 }])
  })

  it('gives each call an empty database when the schema repeats', async () => {
    const items = pgTable('mock_db_items', { id: integer('id').primaryKey() })

    const first = await mockDB({ items })
    await first.insert(items).values({ id: 1 })

    // The second call copies the database file of the first schema push.
    const second = await mockDB({ items })

    expect(await second.select().from(items)).toEqual([])
    expect(await first.select().from(items)).toEqual([{ id: 1 }])
  })

  it('pushes a new schema when a table with the same name changes its columns', async () => {
    await mockDB({ items: pgTable('mock_db_shapes', { id: integer('id').primaryKey() }) })

    const changed = pgTable('mock_db_shapes', { id: integer('id').primaryKey(), count: integer('count').notNull() })
    const db = await mockDB({ items: changed })
    await db.insert(changed).values({ id: 1, count: 2 })

    expect(await db.select().from(changed)).toEqual([{ id: 1, count: 2 }])
  })
})
