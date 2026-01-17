import type { BaseTranscriptionProviderDefinition } from '../base-transcription'

import { orderBy } from 'es-toolkit'

const transcriptionProviderRegistry = new Map<string, BaseTranscriptionProviderDefinition>()

export function listTranscriptionProviders(): BaseTranscriptionProviderDefinition[] {
  const providerDefs = Array.from(transcriptionProviderRegistry.values())
  // Sort by id for consistent ordering
  const sorted = orderBy(providerDefs, ['id'], ['asc'])
  return sorted
}

export function getDefinedTranscriptionProvider(id: string): BaseTranscriptionProviderDefinition | undefined {
  return transcriptionProviderRegistry.get(id)
}

export function defineTranscriptionProvider(definition: BaseTranscriptionProviderDefinition): BaseTranscriptionProviderDefinition {
  const provider = {
    ...definition,
  }

  transcriptionProviderRegistry.set(definition.id, definition)

  return provider
}
