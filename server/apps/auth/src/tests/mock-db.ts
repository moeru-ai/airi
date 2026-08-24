import type { pushSchema as PushSchema } from 'drizzle-kit/api'

import { createRequire } from 'node:module'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import * as authSchema from '@proj-airi/auth-shared'

/** Creates an in-memory database with the standalone Auth service schema. */
export async function createTestDatabase() {
  const client = new PGlite()
  const database = drizzle(client)

  // NOTICE:
  // drizzle-kit's `api` entry is CommonJS while this Vitest project is ESM.
  // Loading it via createRequire preserves its public runtime boundary.
  // Source/context: server/apps/api/src/libs/mock-db.ts uses the same drizzle-kit API.
  // Removal condition: drizzle-kit exposes a working ESM API entry.
  const require = createRequire(import.meta.url)
  const { pushSchema } = require('drizzle-kit/api') as { pushSchema: typeof PushSchema }
  const { apply } = await pushSchema(authSchema, database)
  await apply()

  return database
}
