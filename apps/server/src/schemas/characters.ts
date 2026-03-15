import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import type { AvatarModelConfig } from '../types/character-avatar-model'
import type { CharacterCapabilityConfig } from '../types/character-capability'

import { relations } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'
import { characterBookmarks, characterLikes } from './user-character'

export const character = pgTable(
  'characters',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    version: text('version').notNull(),
    coverUrl: text('cover_url').notNull(),

    // TODO: json patch?

    creatorId: text('creator_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull(),
    avatarUrl: text('avatar_url'),
    creatorRole: text('creator_role'),
    priceCredit: text('price_credit').default('0').notNull(),

    likesCount: integer('likes_count').default(0).notNull(),
    bookmarksCount: integer('bookmarks_count').default(0).notNull(),
    interactionsCount: integer('interactions_count').default(0).notNull(),
    forksCount: integer('forks_count').default(0).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export type Character = InferSelectModel<typeof character>
export type NewCharacter = InferInsertModel<typeof character>

export const characterCovers = pgTable(
  'character_covers',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),

    foregroundUrl: text('foreground_url').notNull(),
    backgroundUrl: text('background_url').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)
export type CharacterCover = InferSelectModel<typeof characterCovers>
export type NewCharacterCover = InferInsertModel<typeof characterCovers>

export const avatarModel = pgTable(
  'avatar_model',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull().$type<keyof AvatarModelConfig>(),

    description: text('description').notNull(),

    config: jsonb('config').notNull().$type<AvatarModelConfig[keyof AvatarModelConfig]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export type AvatarModel = InferSelectModel<typeof avatarModel>
export type NewAvatarModel = InferInsertModel<typeof avatarModel>

export const characterCapabilities = pgTable(
  'character_capabilities',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),

    type: text('type').notNull().$type<keyof CharacterCapabilityConfig>(),

    config: jsonb('config').notNull().$type<CharacterCapabilityConfig[keyof CharacterCapabilityConfig]>(),
  },
)

export type CharacterCapability = InferSelectModel<typeof characterCapabilities>
export type NewCharacterCapability = InferInsertModel<typeof characterCapabilities>

export const characterI18n = pgTable(
  'character_i18n',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),

    language: text('language').notNull(),

    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description').notNull(),
    tags: text('tags').array().notNull(),

    // TODO: Implement the system prompt
    // systemPrompt: text('system_prompt').notNull(),
    // TODO: Implement the personality
    // personality: text('personality').notNull(),

    // TODO: Implement the initial memories
    // initialMemories: text('initial_memories').array().notNull(),

    // TODO: greetings?
    // TODO: notes?
    // TODO: metadata?

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export type CharacterI18n = InferSelectModel<typeof characterI18n>
export type NewCharacterI18n = InferInsertModel<typeof characterI18n>

type PromptType = 'system' | 'personality' | 'greetings'

export const characterPrompts = pgTable(
  'character_prompts',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    characterId: text('character_id').notNull().references(() => character.id, { onDelete: 'cascade' }),

    language: text('language').notNull(),
    type: text('type').notNull().$type<PromptType>(),
    content: text('content').notNull(),
  },
)

export type CharacterPrompt = InferSelectModel<typeof characterPrompts>
export type NewCharacterPrompt = InferInsertModel<typeof characterPrompts>

export const characterRelations = relations(
  character,
  ({ one, many }) => ({
    capabilities: many(characterCapabilities),
    avatarModels: many(avatarModel),
    i18n: many(characterI18n),
    prompts: many(characterPrompts),
    likes: many(characterLikes),
    bookmarks: many(characterBookmarks),
    owner: one(user, {
      fields: [character.ownerId],
      references: [user.id],
    }),
    creator: one(user, {
      fields: [character.creatorId],
      references: [user.id],
    }),
    cover: one(characterCovers, {
      fields: [character.id],
      references: [characterCovers.characterId],
    }),
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
