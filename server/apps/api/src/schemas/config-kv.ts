import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/** Operator-managed configuration stored as its canonical JSON text. */
export const configKV = pgTable('config_kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
