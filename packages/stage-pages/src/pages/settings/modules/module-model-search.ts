import type { SettingsSearchItem } from '@proj-airi/stage-shared/settings-search'
import type { ProviderMetadata } from '@proj-airi/stage-ui/libs/providers/metadata'

import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

/** A module page that picks a provider, then a model of it. */
export type ModelSearchModule = 'consciousness' | 'vision' | 'transcription' | 'speech'

/** The marker of a provider card on a module page. */
export function moduleProviderSearchKey(module: ModelSearchModule, providerId: string) {
  return `module-provider:${module}:${providerId}`
}

/** The marker of a model in the model list of a module page. */
export function moduleModelSearchKey(module: ModelSearchModule, providerId: string, modelId: string) {
  return `module-model:${module}:${providerId}:${modelId}`
}

/** The marker of a voice in the voice list of the speech page. */
export function speechVoiceSearchKey(providerId: string, voiceId: string) {
  return `speech-voice:${providerId}:${voiceId}`
}

/**
 * Lists the providers that a module page offers, and the models of each one.
 *
 * The model list shows only the models of the picked provider. So the result of a model lists two markers:
 * its own row, and the card of its provider. When the provider is not picked, search highlights the provider card,
 * which is the step to take first.
 *
 * A catalog that the app already loaded is reused. Only a provider without one loads it, as its page does when it opens.
 */
export async function moduleModelItems(module: ModelSearchModule, providers: readonly ProviderMetadata[]): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  await Promise.all(providers.map(async (provider) => {
    if (providerStore.supportsModelListing(provider.id) && providerStore.providerRuntimeState[provider.id]?.modelStatus !== 'ready')
      await providerStore.fetchModelsForProvider(provider.id).catch(() => undefined)
  }))

  return providers.flatMap((provider) => {
    const providerKey = moduleProviderSearchKey(module, provider.id)
    return [
      { title: provider.localizedName, key: providerKey },
      ...providerStore.getModelsForProvider(provider.id).map(model => ({
        title: model.name || model.id,
        key: `${moduleModelSearchKey(module, provider.id, model.id)} ${providerKey}`,
        section: provider.localizedName,
      })),
    ]
  })
}

/**
 * Lists the voices of the speech providers. Like a model, a voice shows only under its picked provider,
 * so its result also names the provider card.
 */
export async function speechVoiceItems(providers: readonly ProviderMetadata[]): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  const speechStore = useSpeechStore()
  const voices = await Promise.all(providers.map(async provider =>
    speechStore.availableVoices[provider.id] ?? await providerStore.listProviderVoices(provider.id).catch(() => undefined) ?? []))

  return providers.flatMap((provider, index) => voices[index].map(voice => ({
    title: voice.name || voice.id,
    key: `${speechVoiceSearchKey(provider.id, voice.id)} ${moduleProviderSearchKey('speech', provider.id)}`,
    section: provider.localizedName,
  })))
}
