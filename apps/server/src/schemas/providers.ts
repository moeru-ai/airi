import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { relations } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    definitionId: text('definition_id').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').notNull().default({}),
    validated: boolean('validated').notNull().default(false),
    validationBypassed: boolean('validation_bypassed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export type ProviderConfig = InferSelectModel<typeof providerConfigs>
export type NewProviderConfig = InferInsertModel<typeof providerConfigs>

export const providerConfigsRelations = relations(
  providerConfigs,
  ({ one }) => ({
    owner: one(user, {
      fields: [providerConfigs.ownerId],
      references: [user.id],
    }),
  }),
)

