import type { CapabilityAliasRoute } from '../../../schemas/provider-catalog'
import type { LlmRouteRequest } from '../../../services/domain/llm-router/types'
import type { V1RouteDeps } from './types'

import { createBadRequestError } from '../../../utils/error'
import { newRouteContext } from './middlewares/telemetry'

interface ModelAliasPlan {
  modelIds: string[]
}

/** Resolves configured primary and fallback models in alias policy order. */
export async function resolveModelAliasPlan(deps: V1RouteDeps, aliasId: string): Promise<ModelAliasPlan> {
  const alias = await deps.providerCatalogService.resolveEnabledAlias('llm', aliasId)
  const primaryRoutes = alias.routes.filter(route => route.pool === 'primary')
  const fallbackRoutes = alias.fallbackEnabled
    ? alias.routes.filter(route => route.pool === 'fallback')
    : []
  const orderedPrimaryRoutes = alias.loadBalancingEnabled
    ? weightedRouteOrder(primaryRoutes)
    : primaryRoutes
  const routedModelIds = uniqueModelIds([...orderedPrimaryRoutes, ...fallbackRoutes])

  if (routedModelIds.length === 0) {
    throw createBadRequestError('Capability alias has no enabled route', 'CAPABILITY_ALIAS_ROUTE_NOT_FOUND', {
      surface: 'llm',
      aliasId,
    })
  }

  return { modelIds: routedModelIds }
}

/** Routes alias candidates without discarding an upstream error for an unsupported protocol. */
export async function routeModelAliasCandidates(input: {
  deps: V1RouteDeps
  body: Record<string, unknown>
  modelIds: string[]
  abortSignal?: AbortSignal
  protocol?: LlmRouteRequest['protocol']
}): Promise<{
  modelId: string
  response: Response
  routeCtx: ReturnType<typeof newRouteContext>
}> {
  let lastError: unknown
  let lastResponse: { modelId: string, response: Response, routeCtx: ReturnType<typeof newRouteContext> } | undefined
  for (let index = 0; index < input.modelIds.length; index += 1) {
    const modelId = input.modelIds[index]
    const routeCtx = newRouteContext()
    try {
      const response = await input.deps.llmRouter.route({
        modelName: modelId,
        protocol: input.protocol,
        body: input.body,
        headers: {},
        abortSignal: input.abortSignal,
      }, routeCtx)
      await lastResponse?.response.body?.cancel()
      if (response.ok || index === input.modelIds.length - 1)
        return { modelId, response, routeCtx }
      // Keep the last HTTP failure until another candidate produces a response.
      // An incompatible alias candidate must not erase the upstream error.
      lastResponse = { modelId, response, routeCtx }
    }
    catch (err) {
      if (input.abortSignal?.aborted) {
        await lastResponse?.response.body?.cancel()
        throw err
      }
      lastError = err
    }
  }

  if (lastResponse)
    return lastResponse
  throw lastError
}

function weightedRouteOrder(routes: CapabilityAliasRoute[]): CapabilityAliasRoute[] {
  if (routes.length <= 1)
    return routes

  const totalWeight = routes.reduce((sum, route) => sum + Math.max(route.weight, 0), 0)
  if (totalWeight <= 0)
    return routes

  let cursor = Math.random() * totalWeight
  const selectedIndex = routes.findIndex((route) => {
    cursor -= Math.max(route.weight, 0)
    return cursor < 0
  })
  if (selectedIndex < 0)
    return routes

  const selected = routes[selectedIndex]
  return [
    selected,
    ...routes.filter((_, index) => index !== selectedIndex),
  ]
}

function uniqueModelIds(routes: CapabilityAliasRoute[]): string[] {
  return Array.from(new Set(routes.map(route => route.routerModelId)))
}
