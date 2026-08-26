import type { Database } from '../../../libs/db'
import type {
  CapabilityAlias,
  CapabilityAliasRoute,
  CapabilityAliasRoutePool,
  CapabilityAliasSurface,
  ProviderCatalogTtsModel,
  ProviderCatalogTtsVoice,
  ProviderCatalogTtsVoiceLabels,
  ProviderCatalogTtsVoiceLanguage,
} from '../../../schemas/provider-catalog'

import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  capabilityAliases,
  capabilityAliasRoutes,
  providerCatalogTtsModels,
  providerCatalogTtsVoices,
} from '../../../schemas/provider-catalog'
import { createBadRequestError } from '../../../utils/error'

const DEFAULT_ALIAS_ID = 'auto'

export interface ProviderCatalogTtsModelSyncInput {
  provider: string
}

export interface ProviderCatalogTtsVoiceSyncInput {
  id: string
  name?: string
  languages?: ProviderCatalogTtsVoiceLanguage[]
  labels?: ProviderCatalogTtsVoiceLabels
  previewAudioUrl?: string | null
}

export interface CapabilityAliasWithRoutes extends CapabilityAlias {
  routes: CapabilityAliasRoute[]
}

export interface ProviderCatalogTtsVoiceWithModel {
  model: ProviderCatalogTtsModel
  voice: ProviderCatalogTtsVoice
}

export interface CapabilityAliasUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
  fallbackEnabled?: boolean
  loadBalancingEnabled?: boolean
}

export interface CapabilityAliasRouteUpdateInput {
  enabled?: boolean
  pool?: CapabilityAliasRoutePool
  weight?: number
  displayOrder?: number
}

export interface ProviderCatalogTtsModelUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
}

export interface ProviderCatalogTtsVoiceUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
  languages?: ProviderCatalogTtsVoiceLanguage[]
  labels?: ProviderCatalogTtsVoiceLabels
  previewAudioUrl?: string | null
}

function defaultAliasDisplayName(surface: CapabilityAliasSurface, aliasId: string): string {
  if (aliasId !== DEFAULT_ALIAS_ID)
    return aliasId
  return surface === 'llm' ? 'Auto' : 'Auto Transcription'
}

function nextOrder(rows: Array<{ displayOrder: number }>): number {
  if (rows.length === 0)
    return 0
  return Math.max(...rows.map(row => row.displayOrder)) + 1
}

function catalogError(message: string, errorCode: string, details?: unknown) {
  return createBadRequestError(message, errorCode, details)
}

/**
 * Owns AIRI's provider catalog curation state.
 *
 * The router config still owns real provider URLs, keys, and fallback
 * mechanics. Capability aliases and provider model or voice rows decide what
 * users can see and what gateway requests may use. Public list endpoints and
 * gateway request gates should both call this service so UI hiding and
 * handwritten request validation cannot drift.
 */
export function createProviderCatalogService(db: Database) {
  async function findAlias(surface: CapabilityAliasSurface, aliasId: string) {
    return await db.query.capabilityAliases.findFirst({
      where: and(
        eq(capabilityAliases.surface, surface),
        eq(capabilityAliases.aliasId, aliasId),
      ),
    })
  }

  async function ensureAlias(surface: CapabilityAliasSurface, aliasId: string) {
    const existing = await findAlias(surface, aliasId)
    if (existing)
      return existing

    const existingAliases = await db.query.capabilityAliases.findMany({
      where: eq(capabilityAliases.surface, surface),
    })
    const [created] = await db.insert(capabilityAliases).values({
      surface,
      aliasId,
      displayName: defaultAliasDisplayName(surface, aliasId),
      enabled: true,
      displayOrder: nextOrder(existingAliases),
      fallbackEnabled: true,
      loadBalancingEnabled: false,
    }).onConflictDoNothing({
      target: [capabilityAliases.surface, capabilityAliases.aliasId],
    }).returning()
    const alias = created ?? await findAlias(surface, aliasId)
    if (!alias)
      throw catalogError('Capability alias could not be synced', 'CAPABILITY_ALIAS_SYNC_FAILED', { surface, aliasId })
    return alias
  }

  async function syncAliasRoute(input: {
    aliasRowId: string
    routerModelId: string
    pool: CapabilityAliasRoutePool
    order: number
  }) {
    const existing = await db.query.capabilityAliasRoutes.findFirst({
      where: and(
        eq(capabilityAliasRoutes.aliasId, input.aliasRowId),
        eq(capabilityAliasRoutes.routerModelId, input.routerModelId),
        eq(capabilityAliasRoutes.pool, input.pool),
      ),
    })

    if (existing)
      return existing

    const [created] = await db.insert(capabilityAliasRoutes).values({
      aliasId: input.aliasRowId,
      routerModelId: input.routerModelId,
      pool: input.pool,
      enabled: true,
      weight: 1,
      displayOrder: input.order,
    }).onConflictDoNothing({
      target: [
        capabilityAliasRoutes.aliasId,
        capabilityAliasRoutes.routerModelId,
        capabilityAliasRoutes.pool,
      ],
    }).returning()
    const route = created ?? await db.query.capabilityAliasRoutes.findFirst({
      where: and(
        eq(capabilityAliasRoutes.aliasId, input.aliasRowId),
        eq(capabilityAliasRoutes.routerModelId, input.routerModelId),
        eq(capabilityAliasRoutes.pool, input.pool),
      ),
    })
    if (!route) {
      throw catalogError('Capability alias route could not be synced', 'CAPABILITY_ALIAS_ROUTE_SYNC_FAILED', {
        routerModelId: input.routerModelId,
        pool: input.pool,
      })
    }
    return route
  }

  return {
    async syncAliasesFromRouterConfig(input: {
      surface: CapabilityAliasSurface
      modelIds: string[]
    }) {
      const alias = await ensureAlias(input.surface, DEFAULT_ALIAS_ID)
      const uniqueModelIds = Array.from(new Set(input.modelIds))
      for (const [index, routerModelId] of uniqueModelIds.entries()) {
        await syncAliasRoute({
          aliasRowId: alias.id,
          routerModelId,
          pool: 'primary',
          order: index,
        })
      }

      return await db.query.capabilityAliases.findMany({
        where: eq(capabilityAliases.surface, input.surface),
        orderBy: [asc(capabilityAliases.displayOrder), asc(capabilityAliases.aliasId)],
      })
    },

    async listAliases(surface?: CapabilityAliasSurface): Promise<CapabilityAliasWithRoutes[]> {
      const aliases = await db.query.capabilityAliases.findMany({
        where: surface ? eq(capabilityAliases.surface, surface) : undefined,
        orderBy: [asc(capabilityAliases.displayOrder), asc(capabilityAliases.aliasId)],
      })
      if (aliases.length === 0)
        return []

      const routes = await db.query.capabilityAliasRoutes.findMany({
        where: inArray(capabilityAliasRoutes.aliasId, aliases.map(alias => alias.id)),
        orderBy: [asc(capabilityAliasRoutes.displayOrder), asc(capabilityAliasRoutes.routerModelId)],
      })
      return aliases.map(alias => ({
        ...alias,
        routes: routes.filter(route => route.aliasId === alias.id),
      }))
    },

    async updateAlias(id: string, input: CapabilityAliasUpdateInput): Promise<CapabilityAlias | null> {
      const [updated] = await db.update(capabilityAliases)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(capabilityAliases.id, id))
        .returning()
      return updated ?? null
    },

    async updateAliasRoute(id: string, input: CapabilityAliasRouteUpdateInput): Promise<CapabilityAliasRoute | null> {
      const [updated] = await db.update(capabilityAliasRoutes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(capabilityAliasRoutes.id, id))
        .returning()
      return updated ?? null
    },

    async resolveEnabledAlias(surface: CapabilityAliasSurface, aliasId: string): Promise<CapabilityAliasWithRoutes> {
      const alias = await findAlias(surface, aliasId)
      if (!alias) {
        throw catalogError('Capability alias is not configured', 'CAPABILITY_ALIAS_NOT_FOUND', { surface, aliasId })
      }
      if (!alias.enabled) {
        throw catalogError('Capability alias is disabled', 'CAPABILITY_ALIAS_DISABLED', { surface, aliasId })
      }

      const routes = await db.query.capabilityAliasRoutes.findMany({
        where: and(
          eq(capabilityAliasRoutes.aliasId, alias.id),
          eq(capabilityAliasRoutes.enabled, true),
        ),
        orderBy: [asc(capabilityAliasRoutes.displayOrder), asc(capabilityAliasRoutes.routerModelId)],
      })
      if (routes.length === 0) {
        throw catalogError('Capability alias has no enabled route', 'CAPABILITY_ALIAS_ROUTE_NOT_FOUND', { surface, aliasId })
      }

      return { ...alias, routes }
    },

    async syncTtsModelsFromRouterConfig(input: {
      models: Record<string, ProviderCatalogTtsModelSyncInput>
    }) {
      const existingModels = await db.query.providerCatalogTtsModels.findMany()
      const synced: ProviderCatalogTtsModel[] = []
      const now = new Date()

      for (const [routerModelId, model] of Object.entries(input.models).sort(([a], [b]) => a.localeCompare(b))) {
        const [syncedModel] = await db.insert(providerCatalogTtsModels).values({
          routerModelId,
          provider: model.provider,
          displayName: routerModelId,
          enabled: true,
          displayOrder: nextOrder([...existingModels, ...synced]),
          lastSyncedAt: now,
        }).onConflictDoUpdate({
          target: providerCatalogTtsModels.routerModelId,
          set: {
            provider: model.provider,
            lastSyncedAt: now,
            updatedAt: now,
          },
        }).returning()
        synced.push(syncedModel)
      }

      return synced
    },

    async listTtsModels(): Promise<ProviderCatalogTtsModel[]> {
      return await db.query.providerCatalogTtsModels.findMany({
        orderBy: [asc(providerCatalogTtsModels.displayOrder), asc(providerCatalogTtsModels.routerModelId)],
      })
    },

    async updateTtsModel(id: string, input: ProviderCatalogTtsModelUpdateInput): Promise<ProviderCatalogTtsModel | null> {
      const [updated] = await db.update(providerCatalogTtsModels)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(providerCatalogTtsModels.id, id))
        .returning()
      return updated ?? null
    },

    async listEnabledTtsModels(): Promise<ProviderCatalogTtsModel[]> {
      return await db.query.providerCatalogTtsModels.findMany({
        where: eq(providerCatalogTtsModels.enabled, true),
        orderBy: [asc(providerCatalogTtsModels.displayOrder), asc(providerCatalogTtsModels.routerModelId)],
      })
    },

    async assertTtsModelEnabled(routerModelId: string): Promise<ProviderCatalogTtsModel> {
      const model = await db.query.providerCatalogTtsModels.findFirst({
        where: eq(providerCatalogTtsModels.routerModelId, routerModelId),
      })
      if (!model) {
        throw catalogError('Provider catalog TTS model is not configured', 'PROVIDER_CATALOG_TTS_MODEL_NOT_FOUND', { model: routerModelId })
      }
      if (!model.enabled) {
        throw catalogError('Provider catalog TTS model is disabled', 'PROVIDER_CATALOG_TTS_MODEL_DISABLED', { model: routerModelId })
      }
      return model
    },

    async syncTtsVoices(input: {
      routerModelId: string
      voices: ProviderCatalogTtsVoiceSyncInput[]
    }) {
      const model = await db.query.providerCatalogTtsModels.findFirst({
        where: eq(providerCatalogTtsModels.routerModelId, input.routerModelId),
      })
      if (!model) {
        throw catalogError('Provider catalog TTS model is not configured', 'PROVIDER_CATALOG_TTS_MODEL_NOT_FOUND', { model: input.routerModelId })
      }
      const existingVoices = await db.query.providerCatalogTtsVoices.findMany({
        where: eq(providerCatalogTtsVoices.ttsModelId, model.id),
      })
      const existingByVoiceId = new Map(existingVoices.map(voice => [voice.providerVoiceId, voice]))
      const synced: ProviderCatalogTtsVoice[] = []
      const now = new Date()

      for (const voice of input.voices) {
        const existing = existingByVoiceId.get(voice.id)

        const [syncedVoice] = await db.insert(providerCatalogTtsVoices).values({
          ttsModelId: model.id,
          providerVoiceId: voice.id,
          displayName: voice.name ?? voice.id,
          enabled: false,
          displayOrder: nextOrder([...existingVoices, ...synced]),
          languages: voice.languages ?? [],
          labels: voice.labels ?? {},
          previewAudioUrl: voice.previewAudioUrl ?? null,
          source: 'provider-sync',
          lastSyncedAt: now,
        }).onConflictDoUpdate({
          target: [providerCatalogTtsVoices.ttsModelId, providerCatalogTtsVoices.providerVoiceId],
          set: {
            languages: voice.languages ?? existing?.languages ?? [],
            labels: voice.labels ?? existing?.labels ?? {},
            lastSyncedAt: now,
            updatedAt: now,
          },
        }).returning()
        synced.push(syncedVoice)
      }

      return synced
    },

    async listTtsVoices(routerModelId: string): Promise<ProviderCatalogTtsVoice[]> {
      const model = await db.query.providerCatalogTtsModels.findFirst({
        where: eq(providerCatalogTtsModels.routerModelId, routerModelId),
      })
      if (!model)
        return []

      return await db.query.providerCatalogTtsVoices.findMany({
        where: eq(providerCatalogTtsVoices.ttsModelId, model.id),
        orderBy: [asc(providerCatalogTtsVoices.displayOrder), asc(providerCatalogTtsVoices.providerVoiceId)],
      })
    },

    async getTtsVoiceWithModel(id: string): Promise<ProviderCatalogTtsVoiceWithModel | null> {
      const voice = await db.query.providerCatalogTtsVoices.findFirst({
        where: eq(providerCatalogTtsVoices.id, id),
      })
      if (!voice)
        return null

      const model = await db.query.providerCatalogTtsModels.findFirst({
        where: eq(providerCatalogTtsModels.id, voice.ttsModelId),
      })
      if (!model)
        return null

      return { model, voice }
    },

    async updateTtsVoice(id: string, input: ProviderCatalogTtsVoiceUpdateInput): Promise<ProviderCatalogTtsVoice | null> {
      const [updated] = await db.update(providerCatalogTtsVoices)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(providerCatalogTtsVoices.id, id))
        .returning()
      return updated ?? null
    },

    async listEnabledTtsVoices(routerModelId: string): Promise<ProviderCatalogTtsVoice[]> {
      const model = await this.assertTtsModelEnabled(routerModelId)
      return await db.query.providerCatalogTtsVoices.findMany({
        where: and(
          eq(providerCatalogTtsVoices.ttsModelId, model.id),
          eq(providerCatalogTtsVoices.enabled, true),
        ),
        orderBy: [asc(providerCatalogTtsVoices.displayOrder), asc(providerCatalogTtsVoices.providerVoiceId)],
      })
    },

    async assertTtsVoiceEnabled(routerModelId: string, providerVoiceId: string): Promise<ProviderCatalogTtsVoice> {
      const model = await this.assertTtsModelEnabled(routerModelId)
      const voice = await db.query.providerCatalogTtsVoices.findFirst({
        where: and(
          eq(providerCatalogTtsVoices.ttsModelId, model.id),
          eq(providerCatalogTtsVoices.providerVoiceId, providerVoiceId),
        ),
      })
      if (!voice) {
        throw catalogError('Provider catalog TTS voice is not configured for this model', 'PROVIDER_CATALOG_TTS_VOICE_NOT_FOUND', {
          model: routerModelId,
          voice: providerVoiceId,
        })
      }
      if (!voice.enabled) {
        throw catalogError('Provider catalog TTS voice is disabled', 'PROVIDER_CATALOG_TTS_VOICE_DISABLED', {
          model: routerModelId,
          voice: providerVoiceId,
        })
      }
      return voice
    },
  }
}

export type ProviderCatalogService = ReturnType<typeof createProviderCatalogService>
