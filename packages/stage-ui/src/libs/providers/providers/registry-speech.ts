import type { BaseSpeechProviderDefinition } from '../base-speech'

import { orderBy } from 'es-toolkit'

const speechProviderRegistry = new Map<string, BaseSpeechProviderDefinition>()

export function listSpeechProviders(): BaseSpeechProviderDefinition[] {
  const providerDefs = Array.from(speechProviderRegistry.values())
  // Sort by id for consistent ordering
  const sorted = orderBy(providerDefs, ['id'], ['asc'])
  return sorted
}

export function getDefinedSpeechProvider(id: string): BaseSpeechProviderDefinition | undefined {
  return speechProviderRegistry.get(id)
}

export function defineSpeechProvider(definition: BaseSpeechProviderDefinition): BaseSpeechProviderDefinition {
  const provider = {
    ...definition,
  }

  speechProviderRegistry.set(definition.id, definition)

  return provider
}
