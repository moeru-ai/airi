import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm/relations'

import { user } from './accounts'
import { character } from './characters'

export const characterLikes = pgTable(
  'user_character_likes',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.characterId] }),
  ],
)

export type CharacterLike = InferSelectModel<typeof characterLikes>
export type NewCharacterLike = InferInsertModel<typeof characterLikes>

export const characterBookmarks = pgTable(
  'user_character_bookmarks',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.characterId] }),
  ],
)

export type CharacterBookmark = InferSelectModel<typeof characterBookmarks>
export type NewCharacterBookmark = InferInsertModel<typeof characterBookmarks>

export const characterLikesRelations = relations(
  characterLikes,
  ({ one }) => ({
    user: one(user, {
      fields: [characterLikes.userId],
      references: [user.id],
    }),
    character: one(character, {
      fields: [characterLikes.characterId],
      references: [character.id],
    }),
  }),
)

export const characterBookmarksRelations = relations(
  characterBookmarks,
  ({ one }) => ({
    user: one(user, {
      fields: [characterBookmarks.userId],
      references: [user.id],
    }),
    character: one(character, {
      fields: [characterBookmarks.characterId],
      references: [character.id],
    }),
  }),
)
