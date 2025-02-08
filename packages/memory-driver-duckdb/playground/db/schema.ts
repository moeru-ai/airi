import { sql } from 'drizzle-orm'
import { bigint, pgTable } from 'drizzle-orm/pg-core'

export const users = pgTable('users', () => {
  return {
    id: bigint({ mode: 'number' }).primaryKey().unique().default(sql`0`),
  }
})
