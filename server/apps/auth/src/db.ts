import type { AuthEnv } from './env'

import pg from 'pg'

import { useLogger } from '@guiiai/logg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as authSchema from '@proj-airi/auth-shared'
import * as configSchema from '@proj-airi/config-shared'

const logger = useLogger('db')

/** Database projection visible to the Auth runtime. */
export type AuthDatabase = ReturnType<typeof createAuthDrizzle>['db']

type AuthDrizzleEnv = Pick<AuthEnv, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_POOL_IDLE_TIMEOUT_MS' | 'DB_POOL_CONNECTION_TIMEOUT_MS' | 'DB_POOL_KEEPALIVE_INITIAL_DELAY_MS'>

/**
 * Creates the auth service's database projection. Business tables are not
 * visible through this handle; cross-service work uses the internal HTTP port.
 */
export function createAuthDrizzle(env: AuthDrizzleEnv) {
  // pg must remain a static import so the instrumentation preload can patch it
  // before the Auth application modules are evaluated.
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: env.DB_POOL_KEEPALIVE_INITIAL_DELAY_MS,
  })

  pool.on('error', (error) => {
    logger.withError(error).error('Unexpected pool error on idle client')
  })

  const db = drizzle(pool, { schema: { ...authSchema, ...configSchema } })
  return { db, pool }
}
