import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { user } from '@proj-airi/auth-shared'
import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare ownerId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const userProviderConfigs = pgTable(
  'user_provider_configs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ownerId: text('owner_id').notNull(),
    // Client-assigned provider instance id. The client generates it (its local
    // provider.id), addresses the row through HTTP PUT/DELETE /:id, and keeps
    // it stable across edits so PUT upserts. Scoped by ownerId, not the row PK.
    instanceId: text('instance_id').notNull(),
    definitionId: text('definition_id').notNull(),
    config: text('config').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  table => [
    uniqueIndex('user_provider_configs_owner_instance_uidx').on(table.ownerId, table.instanceId),
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
