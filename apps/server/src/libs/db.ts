import { useLogger } from '@guiiai/logg'
import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as fullSchema from '../schemas'

const logger = useLogger('db')

export type Database = ReturnType<typeof createDrizzle>['db']

export function createDrizzle(dsn: string) {
  const pool = new Pool({
    connectionString: dsn,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  })

  pool.on('error', (err) => {
    logger.withError(err).error('Unexpected pool error on idle client')
  })

  const db = drizzle(pool, { schema: fullSchema })
  return { db, pool }
}

export function migrateDatabase(db: Database) {
  return migrate(db, migrations)
}
