import type { AIChatModelCard } from 'model-bank/types'

import type { ModelInfo, ProviderModelCatalog } from './types'

import { errorMessageFrom } from '@moeru/std'
import { listModels } from '@xsai/model'
import { z } from 'zod'

const discoveredModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  display_name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().optional(),
  contextLength: z.number().optional(),
  deprecated: z.boolean().optional(),
})

const openRouterSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    context_length: z.number().nullish(),
    architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }).optional(),
    supported_parameters: z.array(z.string()).optional(),
    pricing: z.object({
      prompt: z.string().transform(Number).pipe(z.number().finite()),
      completion: z.string().transform(Number).pipe(z.number().finite()),
    }).optional(),
  })),
})

/** Public catalogs describe a route. They never establish native tool or protocol support. */
type CatalogModel = Pick<ModelInfo, 'name' | 'description' | 'contextLength' | 'metadata'>

type CatalogSource
  = | { source: 'model-bank', models: readonly AIChatModelCard[] }
    | { source: 'openrouter' }

// Only public, credential-free snapshots are shared. Failed reads expire immediately.
// Successful reads last one hour. Generation never waits for catalog discovery.
function createSnapshotReader<T>(url: string, schema: z.ZodType<T>) {
  let snapshot: { expiresAt: number, data: Promise<T> } | undefined
  return async (): Promise<T> => {
    if (snapshot && snapshot.expiresAt > Date.now())
      return snapshot.data

    const data = (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), credentials: 'omit' })
      if (!response.ok)
        throw new Error(`Catalog request failed (${response.status})`)
      return schema.parse(await response.json())
    })()
    const current = { expiresAt: Date.now() + 60 * 60 * 1000, data }
    snapshot = current
    try {
      return await data
    }
    catch (error) {
      if (snapshot === current)
        snapshot = undefined
      throw error
    }
  }
}

const readOpenRouter = createSnapshotReader('https://openrouter.ai/api/v1/models', openRouterSchema)

async function readMetadata(source: CatalogSource): Promise<Map<string, CatalogModel>> {
  if (source.source === 'model-bank') {
    return new Map(source.models.map(model => [model.id, {
      name: model.displayName ?? model.id,
      description: model.description,
      contextLength: model.contextWindowTokens,
      metadata: {
        source: 'model-bank',
        abilities: model.abilities,
        maxOutput: model.maxOutput,
        pricing: model.pricing,
        settings: model.settings,
      },
    }]))
  }

  const catalog = await readOpenRouter()
  return new Map(catalog.data.map(model => [model.id, {
    name: model.name,
    description: model.description,
    contextLength: model.context_length ?? undefined,
    metadata: {
      source: 'openrouter',
      supportedParameters: model.supported_parameters,
      modalities: model.architecture && { input: model.architecture.input_modalities, output: model.architecture.output_modalities },
      // OpenRouter quotes USD per token. This projection uses USD per million tokens.
      pricing: model.pricing && {
        input: model.pricing.prompt * 1_000_000,
        output: model.pricing.completion * 1_000_000,
      },
    },
  }]))
}

/**
 * Lists endpoint models, then adds exact-ID metadata from the route's public catalog.
 * Custom endpoints receive no metadata from another route. Credentials only go to the configured endpoint.
 * Catalog failures preserve discovered models and expose an error separately. They never authorize generation features.
 */
export async function listModelCatalog(
  config: Parameters<typeof listModels>[0],
  route: CatalogSource & { providerId: string, baseURL: string },
): Promise<ProviderModelCatalog> {
  const discovered = await listModels(config)
  const models: ModelInfo[] = discovered.map((value) => {
    const model = discoveredModelSchema.parse(value)
    return {
      id: model.id,
      name: model.name ?? model.display_name ?? model.id,
      provider: route.providerId,
      description: model.description,
      contextLength: model.contextLength ?? model.context_length,
      deprecated: model.deprecated,
    }
  })
  const endpoint = new URL(config.baseURL)
  const official = new URL(route.baseURL)
  if (endpoint.origin !== official.origin || endpoint.pathname.replace(/\/$/, '') !== official.pathname.replace(/\/$/, ''))
    return { models }

  try {
    const metadata = await readMetadata(route)
    return {
      models: models.map((model) => {
        const details = metadata.get(model.id)
        return details ? { ...model, ...details } : model
      }),
    }
  }
  catch (error) {
    // Discovery is authoritative. Missing advisory metadata must not hide usable models.
    return { models, metadataError: errorMessageFrom(error) ?? 'Model catalog is unavailable' }
  }
}
