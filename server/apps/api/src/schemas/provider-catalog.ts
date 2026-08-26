import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export type CapabilityAliasRoutePool = 'fallback' | 'primary'
export type CapabilityAliasSurface = 'asr' | 'llm'

export type ProviderCatalogTtsVoiceLabels = Record<string, unknown>

export interface ProviderCatalogTtsVoiceLanguage {
  code: string
  title?: string
}

export const capabilityAliases = pgTable(
  'capability_aliases',
  {
    aliasId: text('alias_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    displayName: text('display_name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    fallbackEnabled: boolean('fallback_enabled').notNull().default(true),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    loadBalancingEnabled: boolean('load_balancing_enabled').notNull().default(false),
    surface: text('surface').notNull().$type<CapabilityAliasSurface>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('capability_aliases_surface_alias_uidx').on(table.surface, table.aliasId),
  ],
)

export const capabilityAliasRoutes = pgTable(
  'capability_alias_routes',
  {
    aliasId: text('alias_id').notNull().references(() => capabilityAliases.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    pool: text('pool').notNull().$type<CapabilityAliasRoutePool>().default('primary'),
    routerModelId: text('router_model_id').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    weight: integer('weight').notNull().default(1),
  },
  table => [
    uniqueIndex('capability_alias_routes_alias_model_pool_uidx').on(table.aliasId, table.routerModelId, table.pool),
  ],
)

export const providerCatalogTtsModels = pgTable(
  'provider_catalog_tts_models',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    displayName: text('display_name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    lastSyncedAt: timestamp('last_synced_at'),
    provider: text('provider').notNull(),
    routerModelId: text('router_model_id').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('provider_catalog_tts_models_router_model_uidx').on(table.routerModelId),
  ],
)

export const providerCatalogTtsVoices = pgTable(
  'provider_catalog_tts_voices',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    displayName: text('display_name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    enabled: boolean('enabled').notNull().default(false),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    labels: jsonb('labels').notNull().$type<ProviderCatalogTtsVoiceLabels>().default({}),
    languages: jsonb('languages').notNull().$type<ProviderCatalogTtsVoiceLanguage[]>().default([]),
    lastSyncedAt: timestamp('last_synced_at'),
    previewAudioUrl: text('preview_audio_url'),
    providerVoiceId: text('provider_voice_id').notNull(),
    source: text('source').notNull().default('provider-sync'),
    ttsModelId: text('tts_model_id').notNull().references(() => providerCatalogTtsModels.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('provider_catalog_tts_voices_model_voice_uidx').on(table.ttsModelId, table.providerVoiceId),
  ],
)

export type CapabilityAlias = InferSelectModel<typeof capabilityAliases>
export type CapabilityAliasRoute = InferSelectModel<typeof capabilityAliasRoutes>
export type NewCapabilityAlias = InferInsertModel<typeof capabilityAliases>
export type NewCapabilityAliasRoute = InferInsertModel<typeof capabilityAliasRoutes>
export type NewProviderCatalogTtsModel = InferInsertModel<typeof providerCatalogTtsModels>
export type NewProviderCatalogTtsVoice = InferInsertModel<typeof providerCatalogTtsVoices>
export type ProviderCatalogTtsModel = InferSelectModel<typeof providerCatalogTtsModels>
export type ProviderCatalogTtsVoice = InferSelectModel<typeof providerCatalogTtsVoices>
