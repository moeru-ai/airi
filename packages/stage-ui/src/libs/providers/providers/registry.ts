import type { ComposerTranslation } from 'vue-i18n'
import type { $ZodType } from 'zod/v4/core'

import type { ProviderDefinition } from '../types'

import { sortBy } from 'es-toolkit'

const providerRegistry = new Map<string, ProviderDefinition>()

export function listProviders(): ProviderDefinition[] {
  const providerDefs = Array.from(providerRegistry.values())
  return sortBy(providerDefs, [p => p.order, p => p.name.toLowerCase()])
}

export function getDefinedProvider(id: string): ProviderDefinition | undefined {
  return providerRegistry.get(id)
}

export function defineProvider<T>(definition: { createProviderConfig: (contextOptions: { t: ComposerTranslation }) => $ZodType<T> } & ProviderDefinition<T>): ProviderDefinition<T> {
  const provider = {
    ...definition,
  }

  providerRegistry.set(definition.id, definition)

  return provider
}
