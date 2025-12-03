import postgres from 'postgres'

import { drizzle } from 'drizzle-orm/postgres-js'

export type Database = ReturnType<typeof createDrizzle>

export function createDrizzle(dsn: string) {
  return drizzle(postgres(dsn))
}
