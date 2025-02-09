import { sql } from 'drizzle-orm'
import { pgTable, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', () => {
  return {
    id: uuid().primaryKey().unique().default(sql`gen_random_uuid()`),
  }
})
