import type { Database } from '../../../libs/db'
import type {
  OfficialCatalogRoutePool,
  OfficialCatalogSurface,
  OfficialProviderAlias,
  OfficialProviderAliasRoute,
  OfficialTtsModel,
  OfficialTtsVoice,
  OfficialTtsVoiceLabels,
  OfficialTtsVoiceLanguage,
} from '../../../schemas/official-catalog'

import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  officialProviderAliases,
  officialProviderAliasRoutes,
  officialTtsModels,
  officialTtsVoices,
} from '../../../schemas/official-catalog'
import { createBadRequestError } from '../../../utils/error'

const DEFAULT_ALIAS_ID = 'auto'

export interface OfficialTtsModelSyncInput {
  provider: string
}

export interface OfficialTtsVoiceSyncInput {
  id: string
  name?: string
  languages?: OfficialTtsVoiceLanguage[]
  labels?: OfficialTtsVoiceLabels
  previewAudioUrl?: string | null
}

export interface OfficialProviderAliasWithRoutes extends OfficialProviderAlias {
  routes: OfficialProviderAliasRoute[]
}

export interface OfficialProviderAliasUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
  fallbackEnabled?: boolean
  loadBalancingEnabled?: boolean
}

export interface OfficialProviderAliasRouteUpdateInput {
  enabled?: boolean
  pool?: OfficialCatalogRoutePool
  weight?: number
  displayOrder?: number
}

export interface OfficialTtsModelUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
}

export interface OfficialTtsVoiceUpdateInput {
  displayName?: string
  enabled?: boolean
  displayOrder?: number
  languages?: OfficialTtsVoiceLanguage[]
  labels?: OfficialTtsVoiceLabels
  previewAudioUrl?: string | null
}

function defaultAliasDisplayName(surface: OfficialCatalogSurface, aliasId: string): string {
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
 * Owns AIRI's official product catalog.
 *
 * The router config still owns real provider URLs, keys, and fallback
 * mechanics. This service owns what users can see and what requests may use.
 * Public list endpoints and gateway request gates should both call this
 * service so UI hiding and handwritten request validation cannot drift.
 */
export function createOfficialCatalogService(db: Database) {
  async function findAlias(surface: OfficialCatalogSurface, aliasId: string) {
    return await db.query.officialProviderAliases.findFirst({
      where: and(
        eq(officialProviderAliases.surface, surface),
        eq(officialProviderAliases.aliasId, aliasId),
      ),
    })
  }

  async function ensureAlias(surface: OfficialCatalogSurface, aliasId: string) {
    const existing = await findAlias(surface, aliasId)
    if (existing)
      return existing

    const existingAliases = await db.query.officialProviderAliases.findMany({
      where: eq(officialProviderAliases.surface, surface),
    })
    const [created] = await db.insert(officialProviderAliases).values({
      surface,
      aliasId,
      displayName: defaultAliasDisplayName(surface, aliasId),
      enabled: true,
      displayOrder: nextOrder(existingAliases),
      fallbackEnabled: true,
      loadBalancingEnabled: false,
    }).returning()
    return created
  }

  async function syncAliasRoute(input: {
    aliasRowId: string
    routerModelId: string
    pool: OfficialCatalogRoutePool
    order: number
  }) {
    const existing = await db.query.officialProviderAliasRoutes.findFirst({
      where: and(
        eq(officialProviderAliasRoutes.aliasId, input.aliasRowId),
        eq(officialProviderAliasRoutes.routerModelId, input.routerModelId),
        eq(officialProviderAliasRoutes.pool, input.pool),
      ),
    })

    if (existing) {
      const [updated] = await db.update(officialProviderAliasRoutes)
        .set({ updatedAt: new Date() })
        .where(eq(officialProviderAliasRoutes.id, existing.id))
        .returning()
      return updated
    }

    const [created] = await db.insert(officialProviderAliasRoutes).values({
      aliasId: input.aliasRowId,
      routerModelId: input.routerModelId,
      pool: input.pool,
      enabled: true,
      weight: 1,
      displayOrder: input.order,
    }).returning()
    return created
  }

  return {
    async syncAliasesFromRouterConfig(input: {
      surface: OfficialCatalogSurface
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

      return await db.query.officialProviderAliases.findMany({
        where: eq(officialProviderAliases.surface, input.surface),
        orderBy: [asc(officialProviderAliases.displayOrder), asc(officialProviderAliases.aliasId)],
      })
    },

    async listAliases(surface?: OfficialCatalogSurface): Promise<OfficialProviderAliasWithRoutes[]> {
      const aliases = await db.query.officialProviderAliases.findMany({
        where: surface ? eq(officialProviderAliases.surface, surface) : undefined,
        orderBy: [asc(officialProviderAliases.displayOrder), asc(officialProviderAliases.aliasId)],
      })
      if (aliases.length === 0)
        return []

      const routes = await db.query.officialProviderAliasRoutes.findMany({
        where: inArray(officialProviderAliasRoutes.aliasId, aliases.map(alias => alias.id)),
        orderBy: [asc(officialProviderAliasRoutes.displayOrder), asc(officialProviderAliasRoutes.routerModelId)],
      })
      return aliases.map(alias => ({
        ...alias,
        routes: routes.filter(route => route.aliasId === alias.id),
      }))
    },

    async updateAlias(id: string, input: OfficialProviderAliasUpdateInput): Promise<OfficialProviderAlias | null> {
      const [updated] = await db.update(officialProviderAliases)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(officialProviderAliases.id, id))
        .returning()
      return updated ?? null
    },

    async updateAliasRoute(id: string, input: OfficialProviderAliasRouteUpdateInput): Promise<OfficialProviderAliasRoute | null> {
      const [updated] = await db.update(officialProviderAliasRoutes)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(officialProviderAliasRoutes.id, id))
        .returning()
      return updated ?? null
    },

    async resolveEnabledAlias(surface: OfficialCatalogSurface, aliasId: string): Promise<OfficialProviderAliasWithRoutes> {
      const alias = await findAlias(surface, aliasId)
      if (!alias) {
        throw catalogError('Official provider alias is not configured', 'OFFICIAL_ALIAS_NOT_FOUND', { surface, aliasId })
      }
      if (!alias.enabled) {
        throw catalogError('Official provider alias is disabled', 'OFFICIAL_ALIAS_DISABLED', { surface, aliasId })
      }

      const routes = await db.query.officialProviderAliasRoutes.findMany({
        where: and(
          eq(officialProviderAliasRoutes.aliasId, alias.id),
          eq(officialProviderAliasRoutes.enabled, true),
        ),
        orderBy: [asc(officialProviderAliasRoutes.displayOrder), asc(officialProviderAliasRoutes.routerModelId)],
      })
      if (routes.length === 0) {
        throw catalogError('Official provider alias has no enabled route', 'OFFICIAL_ALIAS_ROUTE_NOT_FOUND', { surface, aliasId })
      }

      return { ...alias, routes }
    },

    async syncTtsModelsFromRouterConfig(input: {
      models: Record<string, OfficialTtsModelSyncInput>
    }) {
      const existingModels = await db.query.officialTtsModels.findMany()
      const existingByRouterModel = new Map(existingModels.map(model => [model.routerModelId, model]))
      const synced: OfficialTtsModel[] = []
      const now = new Date()

      for (const [routerModelId, model] of Object.entries(input.models).sort(([a], [b]) => a.localeCompare(b))) {
        const existing = existingByRouterModel.get(routerModelId)
        if (existing) {
          const [updated] = await db.update(officialTtsModels)
            .set({
              provider: model.provider,
              lastSyncedAt: now,
              updatedAt: now,
            })
            .where(eq(officialTtsModels.id, existing.id))
            .returning()
          synced.push(updated)
          continue
        }

        const [created] = await db.insert(officialTtsModels).values({
          routerModelId,
          provider: model.provider,
          displayName: routerModelId,
          enabled: true,
          displayOrder: nextOrder([...existingModels, ...synced]),
          lastSyncedAt: now,
        }).returning()
        synced.push(created)
      }

      return synced
    },

    async listTtsModels(): Promise<OfficialTtsModel[]> {
      return await db.query.officialTtsModels.findMany({
        orderBy: [asc(officialTtsModels.displayOrder), asc(officialTtsModels.routerModelId)],
      })
    },

    async updateTtsModel(id: string, input: OfficialTtsModelUpdateInput): Promise<OfficialTtsModel | null> {
      const [updated] = await db.update(officialTtsModels)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(officialTtsModels.id, id))
        .returning()
      return updated ?? null
    },

    async listEnabledTtsModels(): Promise<OfficialTtsModel[]> {
      return await db.query.officialTtsModels.findMany({
        where: eq(officialTtsModels.enabled, true),
        orderBy: [asc(officialTtsModels.displayOrder), asc(officialTtsModels.routerModelId)],
      })
    },

    async assertTtsModelEnabled(routerModelId: string): Promise<OfficialTtsModel> {
      const model = await db.query.officialTtsModels.findFirst({
        where: eq(officialTtsModels.routerModelId, routerModelId),
      })
      if (!model) {
        throw catalogError('Official TTS model is not configured', 'OFFICIAL_MODEL_NOT_FOUND', { model: routerModelId })
      }
      if (!model.enabled) {
        throw catalogError('Official TTS model is disabled', 'OFFICIAL_MODEL_DISABLED', { model: routerModelId })
      }
      return model
    },

    async syncTtsVoices(input: {
      routerModelId: string
      voices: OfficialTtsVoiceSyncInput[]
    }) {
      const model = await db.query.officialTtsModels.findFirst({
        where: eq(officialTtsModels.routerModelId, input.routerModelId),
      })
      if (!model) {
        throw catalogError('Official TTS model is not configured', 'OFFICIAL_MODEL_NOT_FOUND', { model: input.routerModelId })
      }
      const existingVoices = await db.query.officialTtsVoices.findMany({
        where: eq(officialTtsVoices.ttsModelId, model.id),
      })
      const existingByVoiceId = new Map(existingVoices.map(voice => [voice.providerVoiceId, voice]))
      const synced: OfficialTtsVoice[] = []
      const now = new Date()

      for (const voice of input.voices) {
        const existing = existingByVoiceId.get(voice.id)
        if (existing) {
          const [updated] = await db.update(officialTtsVoices)
            .set({
              languages: voice.languages ?? existing.languages,
              labels: voice.labels ?? existing.labels,
              lastSyncedAt: now,
              updatedAt: now,
            })
            .where(eq(officialTtsVoices.id, existing.id))
            .returning()
          synced.push(updated)
          continue
        }

        const [created] = await db.insert(officialTtsVoices).values({
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
        }).returning()
        synced.push(created)
      }

      return synced
    },

    async listTtsVoices(routerModelId: string): Promise<OfficialTtsVoice[]> {
      const model = await db.query.officialTtsModels.findFirst({
        where: eq(officialTtsModels.routerModelId, routerModelId),
      })
      if (!model)
        return []

      return await db.query.officialTtsVoices.findMany({
        where: eq(officialTtsVoices.ttsModelId, model.id),
        orderBy: [asc(officialTtsVoices.displayOrder), asc(officialTtsVoices.providerVoiceId)],
      })
    },

    async updateTtsVoice(id: string, input: OfficialTtsVoiceUpdateInput): Promise<OfficialTtsVoice | null> {
      const [updated] = await db.update(officialTtsVoices)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(officialTtsVoices.id, id))
        .returning()
      return updated ?? null
    },

    async listEnabledTtsVoices(routerModelId: string): Promise<OfficialTtsVoice[]> {
      const model = await this.assertTtsModelEnabled(routerModelId)
      return await db.query.officialTtsVoices.findMany({
        where: and(
          eq(officialTtsVoices.ttsModelId, model.id),
          eq(officialTtsVoices.enabled, true),
        ),
        orderBy: [asc(officialTtsVoices.displayOrder), asc(officialTtsVoices.providerVoiceId)],
      })
    },

    async assertTtsVoiceEnabled(routerModelId: string, providerVoiceId: string): Promise<OfficialTtsVoice> {
      const model = await this.assertTtsModelEnabled(routerModelId)
      const voice = await db.query.officialTtsVoices.findFirst({
        where: and(
          eq(officialTtsVoices.ttsModelId, model.id),
          eq(officialTtsVoices.providerVoiceId, providerVoiceId),
        ),
      })
      if (!voice) {
        throw catalogError('Official TTS voice is not configured for this model', 'OFFICIAL_VOICE_NOT_FOUND', {
          model: routerModelId,
          voice: providerVoiceId,
        })
      }
      if (!voice.enabled) {
        throw catalogError('Official TTS voice is disabled', 'OFFICIAL_VOICE_DISABLED', {
          model: routerModelId,
          voice: providerVoiceId,
        })
      }
      return voice
    },
  }
}

export type OfficialCatalogService = ReturnType<typeof createOfficialCatalogService>
