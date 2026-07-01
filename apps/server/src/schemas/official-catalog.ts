import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export type OfficialCatalogSurface = 'llm' | 'asr'
export type OfficialCatalogRoutePool = 'primary' | 'fallback'

export interface OfficialTtsVoiceLanguage {
  code: string
  title?: string
}

export type OfficialTtsVoiceLabels = Record<string, unknown>

export const officialProviderAliases = pgTable(
  'official_provider_aliases',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    surface: text('surface').notNull().$type<OfficialCatalogSurface>(),
    aliasId: text('alias_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    fallbackEnabled: boolean('fallback_enabled').notNull().default(true),
    loadBalancingEnabled: boolean('load_balancing_enabled').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('official_provider_aliases_surface_alias_uidx').on(table.surface, table.aliasId),
  ],
)

export const officialProviderAliasRoutes = pgTable(
  'official_provider_alias_routes',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    aliasId: text('alias_id').notNull().references(() => officialProviderAliases.id, { onDelete: 'cascade' }),
    routerModelId: text('router_model_id').notNull(),
    pool: text('pool').notNull().$type<OfficialCatalogRoutePool>().default('primary'),
    enabled: boolean('enabled').notNull().default(true),
    weight: integer('weight').notNull().default(1),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('official_provider_alias_routes_alias_model_pool_uidx').on(table.aliasId, table.routerModelId, table.pool),
  ],
)

export const officialTtsModels = pgTable(
  'official_tts_models',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    routerModelId: text('router_model_id').notNull(),
    provider: text('provider').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('official_tts_models_router_model_uidx').on(table.routerModelId),
  ],
)

export const officialTtsVoices = pgTable(
  'official_tts_voices',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ttsModelId: text('tts_model_id').notNull().references(() => officialTtsModels.id, { onDelete: 'cascade' }),
    providerVoiceId: text('provider_voice_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    languages: jsonb('languages').notNull().$type<OfficialTtsVoiceLanguage[]>().default([]),
    labels: jsonb('labels').notNull().$type<OfficialTtsVoiceLabels>().default({}),
    previewAudioUrl: text('preview_audio_url'),
    source: text('source').notNull().default('provider-sync'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('official_tts_voices_model_voice_uidx').on(table.ttsModelId, table.providerVoiceId),
  ],
)

export type OfficialProviderAlias = InferSelectModel<typeof officialProviderAliases>
export type NewOfficialProviderAlias = InferInsertModel<typeof officialProviderAliases>
export type OfficialProviderAliasRoute = InferSelectModel<typeof officialProviderAliasRoutes>
export type NewOfficialProviderAliasRoute = InferInsertModel<typeof officialProviderAliasRoutes>
export type OfficialTtsModel = InferSelectModel<typeof officialTtsModels>
export type NewOfficialTtsModel = InferInsertModel<typeof officialTtsModels>
export type OfficialTtsVoice = InferSelectModel<typeof officialTtsVoices>
export type NewOfficialTtsVoice = InferInsertModel<typeof officialTtsVoices>
