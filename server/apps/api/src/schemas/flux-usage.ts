import { sql } from 'drizzle-orm'
import { bigint, check, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE:
// Bare userId is intentional, the same as `flux_transaction`. Usage records must outlive the user row.
// Root cause: better-auth hard-deletes the user row, and a cascade would wipe billing history.
// Source: `server/apps/api/docs/ai-context/account-deletion.md`.
// Removal condition: when the ledger tables gain a shared deletion policy.
/** One confirmed micro-Flux fee per source. Rows are append-only. Integer wallet debits live in `flux_transaction`. */
export const fluxUsage = pgTable('flux_usage', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  amountMicroFlux: bigint('amount_micro_flux', { mode: 'number' }).notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('flux_usage_user_source_uidx').on(table.userId, table.sourceType, table.sourceId),
  check('flux_usage_amount_nonnegative', sql`${table.amountMicroFlux} >= 0`),
])
