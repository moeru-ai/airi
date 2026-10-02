import type { AIChatModelCard } from 'model-bank/types'

import type { ModelInfo, ProviderModelCatalog } from './types'

import { listModels } from '@xsai/model'
import { array, boolean, number, object, optional, parse, string } from 'valibot'

const discoveredModelSchema = object({
  id: string(),
  inputModalities: optional(array(string())),
  architecture: optional(object({ input_modalities: optional(array(string())) })),
  name: optional(string()),
  display_name: optional(string()),
  description: optional(string()),
  context_length: optional(number()),
  contextLength: optional(number()),
  deprecated: optional(boolean()),
})

/**
 * Lists endpoint models, then adds exact-ID metadata from the route's model-bank catalog.
 * Custom endpoints receive no metadata from another route. Credentials only go to the configured endpoint.
 * Catalog enrichment does not select protocols or hosted tools. No second catalog request is made.
 */
export async function listModelCatalog(
  config: Parameters<typeof listModels>[0],
  route: { models: readonly AIChatModelCard[], providerId: string, baseURL: string },
): Promise<ProviderModelCatalog> {
  const discovered = await listModels(config)
  const models: ModelInfo[] = discovered.map((value) => {
    const model = parse(discoveredModelSchema, value)
    return {
      id: model.id,
      inputModalities: model.inputModalities ?? model.architecture?.input_modalities,
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

  const metadata = new Map(route.models.map(model => [model.id, model]))
  return {
    models: models.map((model) => {
      const details = metadata.get(model.id)
      if (!details)
        return model
      return {
        ...model,
        name: details.displayName ?? model.name,
        description: details.description ?? model.description,
        contextLength: details.contextWindowTokens ?? model.contextLength,
        metadata: {
          abilities: details.abilities,
          maxOutput: details.maxOutput,
          pricing: details.pricing,
          settings: details.settings,
        },
      }
    }),
  }
}
