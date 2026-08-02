import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { createDatabasePool } from '@proj-airi/server-node-shared'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as fullSchema from '../schemas'

export type Database = ReturnType<typeof createDrizzle>['db']

// NOTICE: db-pool.ts imports pg statically. The OTEL instrumentation hooks are
// registered via --import ./instrumentation.ts before application modules load,
// allowing require-in-the-middle to patch pg for both service runtimes.
export function createDrizzle(env: Parameters<typeof createDatabasePool>[0]) {
  const pool = createDatabasePool(env)
  const db = drizzle(pool, { schema: fullSchema })
  return { db, pool }
}

export function migrateDatabase(db: Database) {
  return migrate(db, migrations)
}
