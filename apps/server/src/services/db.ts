import postgres from 'postgres'

import { drizzle } from 'drizzle-orm/postgres-js'

export type Database<TSchema extends Record<string, unknown> = Record<string, never>> = ReturnType<typeof createDrizzle<TSchema>>

export function createDrizzle<TSchema extends Record<string, unknown>>(dsn: string, schema?: TSchema) {
  return drizzle(postgres(dsn), { schema })
}
