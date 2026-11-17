import type { Database } from './db'

import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { vi } from 'vitest'

/**
 * Database files after the schema push, keyed by the schema snapshot.
 *
 * Vitest isolates each test file, so a test file never reads the database of another file.
 */
const schemaDataDirs = new Map<string, Blob>()

/**
 * Create a mock database for testing purposes.
 *
 * @see https://github.com/drizzle-team/drizzle-orm/issues/4205#issuecomment-2747745901
 */
export async function mockDB(schema: Record<string, unknown>): Promise<Database> {
  // Hack: dynamic require to bypass ESM/CJS issues with drizzle-kit in Vitest
  const { createRequire } = await vi.importActual<typeof import('node:module')>('node:module')
  const require = createRequire(import.meta.url)
  const { generateDrizzleJson, pushSchema } = require('drizzle-kit/api') as typeof import('drizzle-kit/api')

  // A schema push takes seconds, and a copy of its database file takes less than one second.
  // The key ignores the random snapshot ids, so equal schemas share one database file.
  const { id: _id, prevId: _prevId, ...schemaSnapshot } = generateDrizzleJson(schema)
  const schemaKey = JSON.stringify(schemaSnapshot)
  const dataDir = schemaDataDirs.get(schemaKey)
  if (dataDir)
    return drizzle(new PGlite({ loadDataDir: dataDir, extensions: { vector } }), { schema }) as unknown as Database

  // Use in-memory PGlite with vector extension registered so pgvector columns work
  const client = new PGlite({
    extensions: { vector },
  })

  // Create Drizzle instance without running full migrations
  const db = drizzle(client, { schema }) as unknown as Database

  // Enable pgvector type in this in-memory database before applying schema
  // This mirrors the production pglite initialization which runs:
  //   CREATE EXTENSION IF NOT EXISTS vector;
  await db.execute?.(sql`CREATE EXTENSION IF NOT EXISTS vector;`)

  // Sync the in-memory DB with the provided schema definition
  // NOTICE:
  // Drizzle Kit 0.31.10's `pushSchema` declaration rejects the PGlite database type used here.
  // Its `drizzle-kit/api` declaration targets database types that exclude PGlite.
  // Source: `drizzle-kit/api` from Drizzle Kit 0.31.10.
  // Remove this cast when the declaration accepts the PGlite database type.
  // eslint-disable-next-line ts/no-explicit-any
  const { apply } = await pushSchema(schema, db as any)
  await apply()
  schemaDataDirs.set(schemaKey, await client.dumpDataDir('none'))

  return db
}
