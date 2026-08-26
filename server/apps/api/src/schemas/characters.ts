import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import type { AvatarModelConfig } from '../types/character-avatar-model'
import type { CharacterCapabilityConfig } from '../types/character-capability'

import { user } from '@proj-airi/auth-shared'
import { relations } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { characterBookmarks, characterLikes } from './user-character'

export const character = pgTable(
  'characters',
  {
    avatarUrl: text('avatar_url'),
    bookmarksCount: integer('bookmarks_count').default(0).notNull(),
    characterId: text('character_id').notNull(),

    // TODO: json patch?

    coverUrl: text('cover_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // NOTICE: bare creatorId / ownerId is intentional — no FK to user.id.
    // better-auth hard-deletes the user row; a cascade would wipe these
    // soft-delete archive rows.
    // See `server/apps/api/docs/ai-context/account-deletion.md`.
    creatorId: text('creator_id').notNull(),
    creatorRole: text('creator_role'),
    deletedAt: timestamp('deleted_at'),
    forksCount: integer('forks_count').default(0).notNull(),

    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    interactionsCount: integer('interactions_count').default(0).notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
    ownerId: text('owner_id').notNull(),

    priceCredit: text('price_credit').default('0').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    version: text('version').notNull(),
  },
)

export type Character = InferSelectModel<typeof character>
export type NewCharacter = InferInsertModel<typeof character>

export const characterCovers = pgTable(
  'character_covers',
  {
    backgroundUrl: text('background_url').notNull(),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),

    foregroundUrl: text('foreground_url').notNull(),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)
export type CharacterCover = InferSelectModel<typeof characterCovers>
export type NewCharacterCover = InferInsertModel<typeof characterCovers>

export const avatarModel = pgTable(
  'avatar_model',
  {
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    config: jsonb('config').notNull().$type<AvatarModelConfig[keyof AvatarModelConfig]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),

    description: text('description').notNull(),

    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    type: text('type').notNull().$type<keyof AvatarModelConfig>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type AvatarModel = InferSelectModel<typeof avatarModel>
export type NewAvatarModel = InferInsertModel<typeof avatarModel>

export const characterCapabilities = pgTable(
  'character_capabilities',
  {
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    config: jsonb('config').notNull().$type<CharacterCapabilityConfig[keyof CharacterCapabilityConfig]>(),

    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    type: text('type').notNull().$type<keyof CharacterCapabilityConfig>(),
  },
)

export type CharacterCapability = InferSelectModel<typeof characterCapabilities>
export type NewCharacterCapability = InferInsertModel<typeof characterCapabilities>

export const characterI18n = pgTable(
  'character_i18n',
  {
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    deletedAt: timestamp('deleted_at'),

    description: text('description').notNull(),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    language: text('language').notNull(),
    name: text('name').notNull(),

    // TODO: Implement the system prompt
    // systemPrompt: text('system_prompt').notNull(),
    // TODO: Implement the personality
    // personality: text('personality').notNull(),

    // TODO: Implement the initial memories
    // initialMemories: text('initial_memories').array().notNull(),

    // TODO: greetings?
    // TODO: notes?
    // TODO: metadata?

    tagline: text('tagline'),
    tags: text('tags').array().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type CharacterI18n = InferSelectModel<typeof characterI18n>
export type NewCharacterI18n = InferInsertModel<typeof characterI18n>

type PromptType = 'greetings' | 'personality' | 'system'

export const characterPrompts = pgTable(
  'character_prompts',
  {
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),

    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    language: text('language').notNull(),
    type: text('type').notNull().$type<PromptType>(),
  },
)

export type CharacterPrompt = InferSelectModel<typeof characterPrompts>
export type NewCharacterPrompt = InferInsertModel<typeof characterPrompts>

export const characterRelations = relations(
  character,
  ({ many, one }) => ({
    avatarModels: many(avatarModel),
    bookmarks: many(characterBookmarks),
    capabilities: many(characterCapabilities),
    cover: one(characterCovers, {
      fields: [character.id],
      references: [characterCovers.characterId],
    }),
    creator: one(user, {
      fields: [character.creatorId],
      references: [user.id],
    }),
    i18n: many(characterI18n),
    likes: many(characterLikes),
    owner: one(user, {
      fields: [character.ownerId],
      references: [user.id],
    }),
    prompts: many(characterPrompts),
  }),
)

export const characterCoversRelations = relations(
  characterCovers,
  ({ one }) => ({
    character: one(character, {
      fields: [characterCovers.characterId],
      references: [character.id],
    }),
  }),
)

export const avatarModelRelations = relations(
  avatarModel,
  ({ one }) => ({
    character: one(character, {
      fields: [avatarModel.characterId],
      references: [character.id],
    }),
  }),
)

export const characterCapabilitiesRelations = relations(
  characterCapabilities,
  ({ one }) => ({
    character: one(character, {
      fields: [characterCapabilities.characterId],
      references: [character.id],
    }),
  }),
)

export const characterI18nRelations = relations(
  characterI18n,
  ({ one }) => ({
    character: one(character, {
      fields: [characterI18n.characterId],
      references: [character.id],
    }),
  }),
)

export const characterPromptsRelations = relations(
  characterPrompts,
  ({ one }) => ({
    character: one(character, {
      fields: [characterPrompts.characterId],
      references: [character.id],
    }),
  }),
)
