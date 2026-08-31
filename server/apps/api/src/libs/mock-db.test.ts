import { sql } from 'drizzle-orm'
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
})
