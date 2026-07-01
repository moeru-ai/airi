import type { Context } from 'hono'
import type { GenericSchema, InferOutput } from 'valibot'

import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { ProviderCatalogService } from '../../../services/domain/provider-catalog'
import type { HonoEnv } from '../../../types/hono'

import { Hono } from 'hono'
import { boolean, integer, maxLength, minValue, number, object, optional, picklist, pipe, safeParse, string } from 'valibot'

import { adminGuard } from '../../../middlewares/admin-guard'
import { authGuard } from '../../../middlewares/auth'
import { createBadRequestError, createNotFoundError } from '../../../utils/error'

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

export interface AdminCapabilityAliasRoutesDeps {
  configKV: ConfigKVService
  service: ProviderCatalogService
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

async function syncAliasesFromConfig(deps: AdminCapabilityAliasRoutesDeps, surface: 'llm' | 'asr') {
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

/**
 * Admin routes for product capability aliases.
 *
 * Mounted at `/api/admin/capability-aliases`. These routes curate product
 * choices that clients can request, such as LLM `auto` or ASR `auto`. Real
 * provider inventory stays in the provider catalog.
 */
export function createAdminCapabilityAliasRoutes(deps: AdminCapabilityAliasRoutesDeps) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .get('/', async (c) => {
      const rawSurface = c.req.query('surface')
      const parsed = rawSurface ? safeParse(SurfaceSchema, rawSurface) : null
      if (parsed && !parsed.success)
        throw createBadRequestError('Invalid surface', 'INVALID_QUERY', parseIssues(parsed.issues))

      return c.json(await deps.service.listAliases(parsed?.success ? parsed.output : undefined))
    })
    .post('/sync', async (c) => {
      const body = await readBody(c, object({ surface: SurfaceSchema }))
      return c.json({ aliases: await syncAliasesFromConfig(deps, body.surface) })
    })
    .patch('/:id', async (c) => {
      const body = await readBody(c, AliasUpdateBodySchema)
      const updated = await deps.service.updateAlias(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Capability alias not found')
      return c.json(updated)
    })
    .patch('/routes/:id', async (c) => {
      const body = await readBody(c, AliasRouteUpdateBodySchema)
      const updated = await deps.service.updateAliasRoute(c.req.param('id'), body)
      if (!updated)
        throw createNotFoundError('Capability alias route not found')
      return c.json(updated)
    })
}
