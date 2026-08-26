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

export interface CapabilityAliasRouteUpdateInput {
  displayOrder?: number
  enabled?: boolean
  pool?: CapabilityAliasRoutePool
  weight?: number
}

export interface CapabilityAliasUpdateInput {
  displayName?: string
  displayOrder?: number
  enabled?: boolean
  fallbackEnabled?: boolean
  loadBalancingEnabled?: boolean
}

export interface CapabilityAliasWithRoutes extends CapabilityAlias {
  routes: CapabilityAliasRoute[]
}

export type ProviderCatalogService = ReturnType<typeof createProviderCatalogService>

export interface ProviderCatalogTtsModelSyncInput {
  provider: string
}

export interface ProviderCatalogTtsModelUpdateInput {
  displayName?: string
  displayOrder?: number
  enabled?: boolean
}

export interface ProviderCatalogTtsVoiceSyncInput {
  id: string
  labels?: ProviderCatalogTtsVoiceLabels
  languages?: ProviderCatalogTtsVoiceLanguage[]
  name?: string
  previewAudioUrl?: null | string
}

export interface ProviderCatalogTtsVoiceUpdateInput {
  displayName?: string
  displayOrder?: number
  enabled?: boolean
  labels?: ProviderCatalogTtsVoiceLabels
  languages?: ProviderCatalogTtsVoiceLanguage[]
  previewAudioUrl?: null | string
}

export interface ProviderCatalogTtsVoiceWithModel {
  model: ProviderCatalogTtsModel
  voice: ProviderCatalogTtsVoice
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
      aliasId,
      displayName: defaultAliasDisplayName(surface, aliasId),
      displayOrder: nextOrder(existingAliases),
      enabled: true,
      fallbackEnabled: true,
      loadBalancingEnabled: false,
      surface,
    }).onConflictDoNothing({
      target: [capabilityAliases.surface, capabilityAliases.aliasId],
    }).returning()
    const alias = created ?? await findAlias(surface, aliasId)
    if (!alias)
      throw catalogError('Capability alias could not be synced', 'CAPABILITY_ALIAS_SYNC_FAILED', { aliasId, surface })
    return alias
  }

  async function syncAliasRoute(input: {
    aliasRowId: string
    order: number
    pool: CapabilityAliasRoutePool
    routerModelId: string
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
      displayOrder: input.order,
      enabled: true,
      pool: input.pool,
      routerModelId: input.routerModelId,
      weight: 1,
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
        pool: input.pool,
        routerModelId: input.routerModelId,
      })
    }
    return route
  }

  return {
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

    async getTtsVoiceWithModel(id: string): Promise<null | ProviderCatalogTtsVoiceWithModel> {
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

    async listAliases(surface?: CapabilityAliasSurface): Promise<CapabilityAliasWithRoutes[]> {
      const aliases = await db.query.capabilityAliases.findMany({
        orderBy: [asc(capabilityAliases.displayOrder), asc(capabilityAliases.aliasId)],
        where: surface ? eq(capabilityAliases.surface, surface) : undefined,
      })
      if (aliases.length === 0)
        return []

      const routes = await db.query.capabilityAliasRoutes.findMany({
        orderBy: [asc(capabilityAliasRoutes.displayOrder), asc(capabilityAliasRoutes.routerModelId)],
        where: inArray(capabilityAliasRoutes.aliasId, aliases.map(alias => alias.id)),
      })
      return aliases.map(alias => ({
        ...alias,
        routes: routes.filter(route => route.aliasId === alias.id),
      }))
    },

    async listEnabledTtsModels(): Promise<ProviderCatalogTtsModel[]> {
      return await db.query.providerCatalogTtsModels.findMany({
        orderBy: [asc(providerCatalogTtsModels.displayOrder), asc(providerCatalogTtsModels.routerModelId)],
        where: eq(providerCatalogTtsModels.enabled, true),
      })
    },

    async listEnabledTtsVoices(routerModelId: string): Promise<ProviderCatalogTtsVoice[]> {
      const model = await this.assertTtsModelEnabled(routerModelId)
      return await db.query.providerCatalogTtsVoices.findMany({
        orderBy: [asc(providerCatalogTtsVoices.displayOrder), asc(providerCatalogTtsVoices.providerVoiceId)],
        where: and(
          eq(providerCatalogTtsVoices.ttsModelId, model.id),
          eq(providerCatalogTtsVoices.enabled, true),
        ),
      })
    },

    async listTtsModels(): Promise<ProviderCatalogTtsModel[]> {
      return await db.query.providerCatalogTtsModels.findMany({
        orderBy: [asc(providerCatalogTtsModels.displayOrder), asc(providerCatalogTtsModels.routerModelId)],
      })
    },

    async listTtsVoices(routerModelId: string): Promise<ProviderCatalogTtsVoice[]> {
      const model = await db.query.providerCatalogTtsModels.findFirst({
        where: eq(providerCatalogTtsModels.routerModelId, routerModelId),
      })
      if (!model)
        return []

      return await db.query.providerCatalogTtsVoices.findMany({
        orderBy: [asc(providerCatalogTtsVoices.displayOrder), asc(providerCatalogTtsVoices.providerVoiceId)],
        where: eq(providerCatalogTtsVoices.ttsModelId, model.id),
      })
    },

    async resolveEnabledAlias(surface: CapabilityAliasSurface, aliasId: string): Promise<CapabilityAliasWithRoutes> {
      const alias = await findAlias(surface, aliasId)
      if (!alias) {
        throw catalogError('Capability alias is not configured', 'CAPABILITY_ALIAS_NOT_FOUND', { aliasId, surface })
      }
      if (!alias.enabled) {
        throw catalogError('Capability alias is disabled', 'CAPABILITY_ALIAS_DISABLED', { aliasId, surface })
      }

      const routes = await db.query.capabilityAliasRoutes.findMany({
        orderBy: [asc(capabilityAliasRoutes.displayOrder), asc(capabilityAliasRoutes.routerModelId)],
        where: and(
          eq(capabilityAliasRoutes.aliasId, alias.id),
          eq(capabilityAliasRoutes.enabled, true),
        ),
      })
      if (routes.length === 0) {
        throw catalogError('Capability alias has no enabled route', 'CAPABILITY_ALIAS_ROUTE_NOT_FOUND', { aliasId, surface })
      }

      return { ...alias, routes }
    },

    async syncAliasesFromRouterConfig(input: {
      modelIds: string[]
      surface: CapabilityAliasSurface
    }) {
      const alias = await ensureAlias(input.surface, DEFAULT_ALIAS_ID)
      const uniqueModelIds = Array.from(new Set(input.modelIds))
      for (const [index, routerModelId] of uniqueModelIds.entries()) {
        await syncAliasRoute({
          aliasRowId: alias.id,
          order: index,
          pool: 'primary',
          routerModelId,
        })
      }

      return await db.query.capabilityAliases.findMany({
        orderBy: [asc(capabilityAliases.displayOrder), asc(capabilityAliases.aliasId)],
        where: eq(capabilityAliases.surface, input.surface),
      })
    },

    async syncTtsModelsFromRouterConfig(input: {
      models: Record<string, ProviderCatalogTtsModelSyncInput>
    }) {
      const existingModels = await db.query.providerCatalogTtsModels.findMany()
      const synced: ProviderCatalogTtsModel[] = []
      const now = new Date()

      for (const [routerModelId, model] of Object.entries(input.models).sort(([a], [b]) => a.localeCompare(b))) {
        const [syncedModel] = await db.insert(providerCatalogTtsModels).values({
          displayName: routerModelId,
          displayOrder: nextOrder([...existingModels, ...synced]),
          enabled: true,
          lastSyncedAt: now,
          provider: model.provider,
          routerModelId,
        }).onConflictDoUpdate({
          set: {
            lastSyncedAt: now,
            provider: model.provider,
            updatedAt: now,
          },
          target: providerCatalogTtsModels.routerModelId,
        }).returning()
        synced.push(syncedModel)
      }

      return synced
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
          displayName: voice.name ?? voice.id,
          displayOrder: nextOrder([...existingVoices, ...synced]),
          enabled: false,
          labels: voice.labels ?? {},
          languages: voice.languages ?? [],
          lastSyncedAt: now,
          previewAudioUrl: voice.previewAudioUrl ?? null,
          providerVoiceId: voice.id,
          source: 'provider-sync',
          ttsModelId: model.id,
        }).onConflictDoUpdate({
          set: {
            labels: voice.labels ?? existing?.labels ?? {},
            languages: voice.languages ?? existing?.languages ?? [],
            lastSyncedAt: now,
            updatedAt: now,
          },
          target: [providerCatalogTtsVoices.ttsModelId, providerCatalogTtsVoices.providerVoiceId],
        }).returning()
        synced.push(syncedVoice)
      }

      return synced
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

    async updateTtsModel(id: string, input: ProviderCatalogTtsModelUpdateInput): Promise<null | ProviderCatalogTtsModel> {
      const [updated] = await db.update(providerCatalogTtsModels)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(providerCatalogTtsModels.id, id))
        .returning()
      return updated ?? null
    },

    async updateTtsVoice(id: string, input: ProviderCatalogTtsVoiceUpdateInput): Promise<null | ProviderCatalogTtsVoice> {
      const [updated] = await db.update(providerCatalogTtsVoices)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(providerCatalogTtsVoices.id, id))
        .returning()
      return updated ?? null
    },
  }
}

function catalogError(message: string, errorCode: string, details?: unknown) {
  return createBadRequestError(message, errorCode, details)
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
