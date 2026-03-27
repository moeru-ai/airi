import type { Env } from './env'

import { useLogger } from '@guiiai/logg'
import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as fullSchema from '../schemas'

const logger = useLogger('db')

export type Database = ReturnType<typeof createDrizzle>['db']

type DrizzleEnv = Pick<Env, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_POOL_IDLE_TIMEOUT_MS' | 'DB_POOL_CONNECTION_TIMEOUT_MS' | 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS'>

export function createDrizzle(env: DrizzleEnv) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: env.DB_POOL_KEEPALIVE_INITIAL_DELAY_MS,
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
