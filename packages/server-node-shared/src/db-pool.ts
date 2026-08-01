import pg from 'pg'

import { useLogger } from '@guiiai/logg'

export interface DatabasePoolConfig {
  /** PostgreSQL connection string. */
  DATABASE_URL: string
  /** Maximum connections owned by this process. */
  DB_POOL_MAX: number
  /** Milliseconds before an idle connection may be closed. */
  DB_POOL_IDLE_TIMEOUT_MS: number
  /** Milliseconds allowed for establishing a connection. */
  DB_POOL_CONNECTION_TIMEOUT_MS: number
  /** Milliseconds before TCP keepalive probes begin. */
  DB_POOL_KEEPALIVE_INITIAL_DELAY_MS: number
}

/** Creates a PostgreSQL pool for a Node service runtime. */
export function createDatabasePool(config: DatabasePoolConfig) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: config.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DB_POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
    keepAliveInitialDelayMillis: config.DB_POOL_KEEPALIVE_INITIAL_DELAY_MS,
  })

  pool.on('error', (error) => {
    useLogger('db').withError(error).error('Unexpected pool error on idle client')
  })

  return pool
}
