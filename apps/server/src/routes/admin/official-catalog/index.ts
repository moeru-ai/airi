import type { Context } from 'hono'
import type { GenericSchema, InferOutput } from 'valibot'

import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { LlmRouterService } from '../../../services/domain/llm-router'
import type { OfficialCatalogService } from '../../../services/domain/official-catalog'
import type { HonoEnv } from '../../../types/hono'

import { Buffer } from 'node:buffer'

import { Hono } from 'hono'
import { any, array, boolean, integer, maxLength, minValue, nullable, number, object, optional, picklist, pipe, record, safeParse, string } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { normalizeProviderVoiceForCatalog } from '../../../services/domain/official-catalog/provider-voices'
import { createBadGatewayError, createBadRequestError, createNotFoundError } from '../../../utils/error'

const DEFAULT_PREVIEW_TEXT = 'Hello, this is an AIRI voice preview.'

const SurfaceSchema = picklist(['llm', 'asr'])

const AliasUpdateBodySchema = object({
  displayName: optional(pipe(string(), maxLength(120))),
  enabled: optional(boolean()),
  displayOrder: optional(pipe(number(), integer(), minValue(0))),
  fallbackEnabled: optional(boolean()),
  loadBalancingEnabled: optional(boolean()),
})

const AliasRouteUpdateBodySchema = object({
  enabled: optional(boolean()),
  pool: optional(picklist(['primary', 'fallback'])),
  weight: optional(pipe(number(), integer(), minValue(1))),
  displayOrder: optional(pipe(number(), integer(), minValue(0))),
})

const TtsModelUpdateBodySchema = object({
  displayName: optional(pipe(string(), maxLength(120))),
  enabled: optional(boolean()),
  displayOrder: optional(pipe(number(), integer(), minValue(0))),
})

const LanguageSchema = object({
  code: pipe(string(), maxLength(32)),
  title: optional(pipe(string(), maxLength(80))),
})

const TtsVoiceUpdateBodySchema = object({
  displayName: optional(pipe(string(), maxLength(120))),
  enabled: optional(boolean()),
  displayOrder: optional(pipe(number(), integer(), minValue(0))),
  languages: optional(array(LanguageSchema)),
  labels: optional(record(string(), any())),
  previewAudioUrl: optional(nullable(pipe(string(), maxLength(2048)))),
})

const TtsVoiceSyncBodySchema = object({
  routerModelId: pipe(string(), maxLength(160)),
})

const TtsVoicePreviewBodySchema = object({
  text: optional(pipe(string(), maxLength(200)), DEFAULT_PREVIEW_TEXT),
  responseFormat: optional(pipe(string(), maxLength(24))),
})

export interface AdminOfficialCatalogRoutesDeps {
  configKV: ConfigKVService
  llmRouter: LlmRouterService
  service: OfficialCatalogService
}

function parseIssues(issues: Array<{ path?: Array<{ key: unknown }>, message: string }>) {
  return issues.map(i => ({
    path: i.path?.map(p => p.key).join('.'),
    message: i.message,
  }))
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  const raw = await c.req.json().catch(() => null)
  if (raw == null)
    throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')
  return raw
}

async function readBody<S extends GenericSchema>(c: Context<HonoEnv>, schema: S): Promise<InferOutput<S>> {
  const parsed = safeParse(schema, await readJson(c))
  if (!parsed.success)
    throw createBadRequestError('Invalid request body', 'INVALID_BODY', parseIssues(parsed.issues))
  return parsed.output
}

async function syncAliasesFromConfig(deps: AdminOfficialCatalogRoutesDeps, surface: 'llm' | 'asr') {
  const config = await deps.configKV.getOrThrow('LLM_ROUTER_CONFIG')
  if (surface === 'llm') {
    const defaultModel = await deps.configKV.getOrThrow('DEFAULT_CHAT_MODEL')
    const modelIds = [
      defaultModel,
      ...Object.keys(config.llm.models).sort().filter(modelId => modelId !== defaultModel),
    ]
    return await deps.service.syncAliasesFromRouterConfig({ surface, modelIds })
  }

  return await deps.service.syncAliasesFromRouterConfig({
    surface,
    modelIds: Object.keys(config.asr?.models ?? {}).sort(),
  })
}

async function syncTtsModelsFromConfig(deps: AdminOfficialCatalogRoutesDeps) {
  const config = await deps.configKV.getOrThrow('LLM_ROUTER_CONFIG')
  return await deps.service.syncTtsModelsFromRouterConfig({
    models: Object.fromEntries(
      Object.entries(config.tts.models).map(([routerModelId, model]) => [
        routerModelId,
        { provider: model.provider },
      ]),
    ),
  })
}

/**
 * Admin routes for the official provider catalog.
 *
 * Mounted at `/api/admin/official-catalog`. These routes curate only the
 * product catalog state: enabled flags, display order, aliases, and TTS voice
 * metadata. Real upstream URLs, credentials, and provider fallback config stay
 * owned by `LLM_ROUTER_CONFIG`.
 */
export function createAdminOfficialCatalogRoutes(deps: AdminOfficialCatalogRoutesDeps) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .get('/aliases', async (c) => {
      const rawSurface = c.req.query('surface')
      const parsed = rawSurface ? safeParse(SurfaceSchema, rawSurface) : null
      if (parsed && !parsed.success)
        throw createBadRequestError('Invalid surface', 'INVALID_QUERY', parseIssues(parsed.issues))

      return c.json(await deps.service.listAliases(parsed?.success ? parsed.output : undefined))
    })
    .post('/aliases/sync', async (c) => {
      const body = await readBody(c, object({ surface: SurfaceSchema }))
      return c.json({ aliases: await syncAliasesFromConfig(deps, body.surface) })
    })
    .patch('/aliases/:id', async (c) => {
      const body = await readBody(c, AliasUpdateBodySchema)
      const updated = await deps.service.updateAlias(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Official alias not found')
      return c.json(updated)
    })
    .patch('/alias-routes/:id', async (c) => {
      const body = await readBody(c, AliasRouteUpdateBodySchema)
      const updated = await deps.service.updateAliasRoute(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Official alias route not found')
      return c.json(updated)
    })
    .get('/tts/models', async (c) => {
      return c.json(await deps.service.listTtsModels())
    })
    .post('/tts/models/sync', async (c) => {
      return c.json({ models: await syncTtsModelsFromConfig(deps) })
    })
    .patch('/tts/models/:id', async (c) => {
      const body = await readBody(c, TtsModelUpdateBodySchema)
      const updated = await deps.service.updateTtsModel(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Official TTS model not found')
      return c.json(updated)
    })
    .get('/tts/voices', async (c) => {
      const routerModelId = c.req.query('model')
      if (!routerModelId)
        throw createBadRequestError('model query is required', 'MISSING_MODEL')
      return c.json(await deps.service.listTtsVoices(routerModelId))
    })
    .post('/tts/voices/sync', async (c) => {
      const body = await readBody(c, TtsVoiceSyncBodySchema)
      await syncTtsModelsFromConfig(deps)
      const providerVoices = await deps.llmRouter.listTtsVoices(body.routerModelId)
      const voices = providerVoices.map(normalizeProviderVoiceForCatalog).filter(voice => voice != null)
      const synced = await deps.service.syncTtsVoices({ routerModelId: body.routerModelId, voices })
      return c.json({ voices: synced, syncedCount: synced.length })
    })
    .post('/tts/voices/:id/preview', async (c) => {
      const body = await readBody(c, TtsVoicePreviewBodySchema)
      const row = await deps.service.getTtsVoiceWithModel(c.req.param('id'))
      if (!row)
        throw createNotFoundError('Official TTS voice not found')

      const response = await deps.llmRouter.routeTts({
        modelName: row.model.routerModelId,
        input: {
          text: body.text || DEFAULT_PREVIEW_TEXT,
          voice: row.voice.providerVoiceId,
          responseFormat: body.responseFormat,
        },
      })
      if (!response.ok)
        throw createBadGatewayError(`TTS preview upstream ${response.status}`, { lastStatusCode: response.status })

      const contentType = response.headers.get('content-type') ?? 'audio/mpeg'
      const bytes = await response.arrayBuffer()
      const previewAudioUrl = `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
      const updated = await deps.service.updateTtsVoice(row.voice.id, { previewAudioUrl })
      if (!updated)
        throw createNotFoundError('Official TTS voice not found')

      return c.json({
        voice: updated,
        contentType,
        byteLength: bytes.byteLength,
      })
    })
    .patch('/tts/voices/:id', async (c) => {
      const body = await readBody(c, TtsVoiceUpdateBodySchema)
      const updated = await deps.service.updateTtsVoice(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Official TTS voice not found')
      return c.json(updated)
    })
}
