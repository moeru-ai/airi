import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { user } from '@proj-airi/auth-shared'
import { relations } from 'drizzle-orm'
import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

// NOTICE: bare ownerId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const userProviderConfigs = pgTable(
  'user_provider_configs',
  {
    id: text('id').notNull(),
    ownerId: text('owner_id').notNull(),
    definitionId: text('definition_id').notNull(),
    config: text('config').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    primaryKey({ columns: [table.ownerId, table.id] }),
  ],
)

export type UserProviderConfig = InferSelectModel<typeof userProviderConfigs>
export type NewUserProviderConfig = InferInsertModel<typeof userProviderConfigs>

export const userProviderConfigsRelations = relations(
  userProviderConfigs,
  ({ one }) => ({
    owner: one(user, {
      fields: [userProviderConfigs.ownerId],
      references: [user.id],
    }),
  }),
)
