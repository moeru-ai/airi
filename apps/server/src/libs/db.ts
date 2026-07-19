import type { Pool, PoolClient } from 'pg'

import type { Env } from './env'

import pg from 'pg'

import { useLogger } from '@guiiai/logg'
import { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'
import { migrations } from '@proj-airi/server-schema'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as fullSchema from '../schemas'

const logger = useLogger('db')

export type Database = ReturnType<typeof createDrizzle>['db']

type DrizzleEnv = Pick<Env, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_POOL_IDLE_TIMEOUT_MS' | 'DB_POOL_CONNECTION_TIMEOUT_MS' | 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS'>

/**
 * Session-scoped advisory lock key shared by every replica of this service.
 * Arbitrary stable int4 — must stay identical across deploys.
 */
const SCHEMA_MIGRATE_LOCK_KEY = 872_314_059

// NOTICE: pg is imported statically here. The OTEL instrumentation hooks are
// registered via --import ./instrumentation.ts (preload) which runs before
// tsx loads application modules, allowing require-in-the-middle to patch pg.
export function createDrizzle(env: DrizzleEnv) {
  const pool = new pg.Pool({
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

/**
 * Runs `run` while holding a Postgres session advisory lock on `client`.
 *
 * Lock and unlock must use the same session: advisory locks are session-scoped,
 * and unlock on another connection would leave the lock held.
 */
export async function withSessionAdvisoryLock<T>(
  client: Pick<PoolClient, 'query'>,
  lockKey: number,
  run: () => Promise<T>,
): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1)', [lockKey])
  try {
    return await run()
  }
  finally {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey])
  }
}

/**
 * Applies Drizzle migrations while holding a Postgres session advisory lock.
 *
 * Railway (and other multi-replica deploys) boot several processes at once;
 * without this lock each replica races `CREATE TABLE` and the loser dies with
 * 42P07 before HTTP listen, so `/livez` healthchecks time out.
 */
export async function migrateDatabase(pool: Pool) {
  const client = await pool.connect()
  try {
    await withSessionAdvisoryLock(client, SCHEMA_MIGRATE_LOCK_KEY, async () => {
      const lockedDb = drizzle(client, { schema: fullSchema })
      await migrate(lockedDb, migrations)
    })
  }
  finally {
    client.release()
  }
}
