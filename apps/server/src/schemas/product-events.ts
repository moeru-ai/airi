import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export type ProductEventMetadata = Record<string, string | number | boolean | null>

export const productEvents = pgTable(
  'product_events',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    userId: text('user_id').notNull(),
    feature: text('feature').notNull(),
    action: text('action').notNull(),
    status: text('status').notNull(),
    source: text('source'),
    model: text('model'),
    provider: text('provider'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<ProductEventMetadata>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('product_events_feature_action_created_at_idx').on(table.feature, table.action, table.createdAt),
    index('product_events_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('product_events_created_at_idx').on(table.createdAt),
  ],
)

export type ProductEvent = InferSelectModel<typeof productEvents>
export type NewProductEvent = InferInsertModel<typeof productEvents>
