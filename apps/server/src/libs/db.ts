import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as fullSchema from '../schemas'

export type Database = ReturnType<typeof createDrizzle>['db']

export function createDrizzle(dsn: string) {
  const pool = new Pool({ connectionString: dsn })
  const db = drizzle(pool, { schema: fullSchema })
  return { db, pool }
}

export function migrateDatabase(db: Database) {
  return migrate(db, migrations)
}
