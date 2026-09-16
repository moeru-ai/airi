import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export type CapabilityAliasSurface = 'llm' | 'asr'
export type CapabilityAliasRoutePool = 'primary' | 'fallback'

export interface ProviderCatalogTtsVoiceLanguage {
  code: string
  title?: string
}

export type ProviderCatalogTtsVoiceLabels = Record<string, unknown>

export const capabilityAliases = pgTable(
  'capability_aliases',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    surface: text('surface').notNull().$type<CapabilityAliasSurface>(),
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
    uniqueIndex('capability_aliases_surface_alias_uidx').on(table.surface, table.aliasId),
  ],
)

export const capabilityAliasRoutes = pgTable(
  'capability_alias_routes',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    aliasId: text('alias_id').notNull().references(() => capabilityAliases.id, { onDelete: 'cascade' }),
    routerModelId: text('router_model_id').notNull(),
    pool: text('pool').notNull().$type<CapabilityAliasRoutePool>().default('primary'),
    enabled: boolean('enabled').notNull().default(true),
    weight: integer('weight').notNull().default(1),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('capability_alias_routes_alias_model_pool_uidx').on(table.aliasId, table.routerModelId, table.pool),
  ],
)

export const providerCatalogTtsModels = pgTable(
  'provider_catalog_tts_models',
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
    uniqueIndex('provider_catalog_tts_models_router_model_uidx').on(table.routerModelId),
  ],
)

export const providerCatalogTtsVoices = pgTable(
  'provider_catalog_tts_voices',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    ttsModelId: text('tts_model_id').notNull().references(() => providerCatalogTtsModels.id, { onDelete: 'cascade' }),
    providerVoiceId: text('provider_voice_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    languages: jsonb('languages').notNull().$type<ProviderCatalogTtsVoiceLanguage[]>().default([]),
    labels: jsonb('labels').notNull().$type<ProviderCatalogTtsVoiceLabels>().default({}),
    previewAudioUrl: text('preview_audio_url'),
    source: text('source').notNull().default('provider-sync'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('provider_catalog_tts_voices_model_voice_uidx').on(table.ttsModelId, table.providerVoiceId),
  ],
)

export type CapabilityAlias = InferSelectModel<typeof capabilityAliases>
export type NewCapabilityAlias = InferInsertModel<typeof capabilityAliases>
export type CapabilityAliasRoute = InferSelectModel<typeof capabilityAliasRoutes>
export type NewCapabilityAliasRoute = InferInsertModel<typeof capabilityAliasRoutes>
export type ProviderCatalogTtsModel = InferSelectModel<typeof providerCatalogTtsModels>
export type NewProviderCatalogTtsModel = InferInsertModel<typeof providerCatalogTtsModels>
export type ProviderCatalogTtsVoice = InferSelectModel<typeof providerCatalogTtsVoices>
export type NewProviderCatalogTtsVoice = InferInsertModel<typeof providerCatalogTtsVoices>
