import type { PortableProviderId } from '@proj-airi/provider-inference'
import type { MaybePromise } from 'clustr'
import type { $ZodType } from 'zod/v4/core'

import type { ProviderConfigContext, ProviderDefinition } from '../types'
import type { providerAliyunNlsTranscription } from './aliyun-nls'
import type { providerAppleSpeechTranscription } from './apple-speech'
import type { providerKokoroLocal } from './kokoro-local'
import type {
  providerAppLocalAudioSpeech,
  providerAppLocalAudioTranscription,
  providerBrowserLocalAudioSpeech,
  providerBrowserLocalAudioTranscription,
} from './local-audio'
import type { providerNvidia } from './nvidia'
import type {
  providerOfficialChat,
  providerOfficialSpeech,
  providerOfficialSpeechStreaming,
  providerOfficialTranscription,
} from './official'

import { orderBy } from 'es-toolkit'

const providerRegistry = new Map<string, ProviderDefinition>()

type StageOnlyProviderId
  = | typeof providerAliyunNlsTranscription.id
    | typeof providerAppleSpeechTranscription.id
    | typeof providerAppLocalAudioSpeech.id
    | typeof providerAppLocalAudioTranscription.id
    | typeof providerBrowserLocalAudioSpeech.id
    | typeof providerBrowserLocalAudioTranscription.id
    | typeof providerKokoroLocal.id
    | typeof providerNvidia.id
    | typeof providerOfficialChat.id
    | typeof providerOfficialSpeech.id
    | typeof providerOfficialSpeechStreaming.id
    | typeof providerOfficialTranscription.id

/** IDs of definitions registered by stage-ui, including portable definitions. */
export type StageProviderId = PortableProviderId | StageOnlyProviderId

/** Adds portable definitions to the stage-ui registry after the runtime definitions load. */
export function registerProviders(definitions: readonly ProviderDefinition[]): void {
  for (const definition of definitions) {
    if (providerRegistry.has(definition.id))
      throw new Error(`Provider definition "${definition.id}" is registered more than once.`)

    providerRegistry.set(definition.id, definition)
  }
}

export function listProviders(): ProviderDefinition[] {
  const providerDefs = Array.from(providerRegistry.values()).map(def => ({ order: 99999, ...def }))
  const sorted = orderBy(providerDefs, [p => p.order, 'name'], ['asc', 'asc'])
  return sorted
}

/** Narrows a runtime provider ID to a definition registered by stage-ui. */
export function isProviderId(id: string): id is StageProviderId {
  return providerRegistry.has(id)
}

/** Returns a registered definition for a literal or runtime provider ID. */
export function getDefinedProvider(id: string): ProviderDefinition | undefined {
  if (!providerRegistry.has(id))
    return undefined

  return providerRegistry.get(id)
}

interface ProviderDefinitionOptions<T, TId extends string = string> extends ProviderDefinition<T, TId> {
  createProviderConfig: (contextOptions: ProviderConfigContext<T>) => MaybePromise<$ZodType<T>>
}

export function defineProvider<T, const TId extends string = string>(definition: ProviderDefinitionOptions<T, TId>): ProviderDefinition<T, TId> {
  const provider = {
    ...definition,
  }

  // The registry selects a provider by id. The selected configuration shape is
  // only known by the caller after that lookup.
  providerRegistry.set(definition.id, definition as unknown as ProviderDefinition)

  return provider
}
