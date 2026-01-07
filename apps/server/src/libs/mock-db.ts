import type { Database } from '../services/db'

import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { vi } from 'vitest'

/**
 * Create a mock database for testing purposes.
 *
 * @see https://github.com/drizzle-team/drizzle-orm/issues/4205#issuecomment-2747745901
 */
export async function mockDB(schema: Record<string, any>): Promise<Database<typeof schema>> {
  // Hack: dynamic require to bypass ESM/CJS issues with drizzle-kit in Vitest
  const { createRequire } = await vi.importActual<typeof import('node:module')>('node:module')
  const require = createRequire(import.meta.url)
  const { pushSchema } = require('drizzle-kit/api') as typeof import('drizzle-kit/api')

  // Use in-memory PGlite with vector extension registered so pgvector columns work
  const client = new PGlite({
    extensions: { vector },
  })

  // Create Drizzle instance without running full migrations
  const db = drizzle(client, { schema }) as unknown as Database<typeof schema>

  // Enable pgvector type in this in-memory database before applying schema
  // This mirrors the production pglite initialization which runs:
  //   CREATE EXTENSION IF NOT EXISTS vector;
  await db.execute?.(sql`CREATE EXTENSION IF NOT EXISTS vector;`)

  // Sync the in-memory DB with the provided schema definition
  const { apply } = await pushSchema(schema, db as any)
  await apply()

  return db
}
