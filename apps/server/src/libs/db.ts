import postgres from 'postgres'

import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/postgres-js'

import * as fullSchema from '../schemas'

export type Database = ReturnType<typeof createDrizzle>

export function createDrizzle(dsn: string) {
  return drizzle(postgres(dsn), { schema: fullSchema })
}

export function migrateDatabase(db: Database) {
  return migrate(db, migrations)
}
