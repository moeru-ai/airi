import { createDatabasePool } from '@proj-airi/server-node-shared'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as authSchema from '@proj-airi/auth-shared'

/** Database projection visible to the Auth runtime. */
export type AuthDatabase = ReturnType<typeof createAuthDrizzle>['db']

/**
 * Creates the auth service's database projection. Business tables are not
 * visible through this handle; cross-service work uses the internal HTTP port.
 */
export function createAuthDrizzle(config: Parameters<typeof createDatabasePool>[0]) {
  const pool = createDatabasePool(config)
  const db = drizzle(pool, { schema: authSchema })
  return { db, pool }
}
