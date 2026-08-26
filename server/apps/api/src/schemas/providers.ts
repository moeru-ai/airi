import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { user } from '@proj-airi/auth-shared'
import { relations } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

// NOTICE: bare ownerId is intentional — no FK to user.id. better-auth hard-deletes
// the user row; a cascade would wipe these soft-delete archive rows.
// See `server/apps/api/docs/ai-context/account-deletion.md`.
export const userProviderConfigs = pgTable(
  'user_provider_configs',
  {
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    definitionId: text('definition_id').notNull(),
    deletedAt: timestamp('deleted_at'),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    ownerId: text('owner_id').notNull(),

    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    validated: boolean('validated').notNull().default(false),
    validationBypassed: boolean('validation_bypassed').notNull().default(false),
  },
)

export type NewUserProviderConfig = InferInsertModel<typeof userProviderConfigs>
export type UserProviderConfig = InferSelectModel<typeof userProviderConfigs>

export const userProviderConfigsRelations = relations(
  userProviderConfigs,
  ({ one }) => ({
    owner: one(user, {
      fields: [userProviderConfigs.ownerId],
      references: [user.id],
    }),
  }),
)

export const systemProviderConfigs = pgTable(
  'system_provider_configs',
  {
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    definitionId: text('definition_id').notNull(),
    deletedAt: timestamp('deleted_at'),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),

    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    validated: boolean('validated').notNull().default(false),
    validationBypassed: boolean('validation_bypassed').notNull().default(false),
  },
)

export type NewSystemProviderConfig = InferInsertModel<typeof systemProviderConfigs>
export type SystemProviderConfig = InferSelectModel<typeof systemProviderConfigs>
