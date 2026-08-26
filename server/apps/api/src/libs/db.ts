import type { Env } from './env'

import { fileURLToPath } from 'node:url'

import pg from 'pg'

import { useLogger } from '@guiiai/logg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

import * as fullSchema from '../schemas'

const logger = useLogger('db')
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))

export type Database = ReturnType<typeof createDrizzle>['db']

type DrizzleEnv = Pick<Env, 'DATABASE_URL' | 'DB_POOL_CONNECTION_TIMEOUT_MS' | 'DB_POOL_IDLE_TIMEOUT_MS' | 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS' | 'DB_POOL_MAX'>

// NOTICE: pg is imported statically here. The OTEL instrumentation hooks are
// registered via --import ./instrumentation.ts (preload) which runs before
// tsx loads application modules, allowing require-in-the-middle to patch pg.
export function createDrizzle(env: DrizzleEnv) {
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: env.DB_POOL_KEEPALIVE_INITIAL_DELAY_MS,
    max: env.DB_POOL_MAX,
  })

  pool.on('error', (err) => {
    logger.withError(err).error('Unexpected pool error on idle client')
  })

  const db = drizzle(pool, { schema: fullSchema })
  return { db, pool }
}

export async function migrateDatabase(db: Database) {
  await migrate(db, { migrationsFolder })
}
