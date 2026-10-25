import type { SettingsSearchItem } from '@proj-airi/stage-shared/settings-search'
import type { ProviderMetadata } from '@proj-airi/stage-ui/libs/providers/metadata'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

/** A module page that picks a provider, then a model of it. */
export type ModelSearchModule = 'consciousness' | 'vision' | 'transcription' | 'speech'

/** The marker of a provider card on a module page. */
export function moduleProviderSearchKey(module: ModelSearchModule, providerId: string) {
  return settingsSearchItemKey('module-provider', module, providerId)
}

/** The marker of a model in the model list of a module page. */
export function moduleModelSearchKey(module: ModelSearchModule, providerId: string, modelId: string) {
  return settingsSearchItemKey('module-model', module, providerId, modelId)
}

/** The marker of a voice in the voice list of the speech page. */
export function speechVoiceSearchKey(providerId: string, voiceId: string) {
  return settingsSearchItemKey('speech-voice', providerId, voiceId)
}

/** Names the provider whose card shows a provider. Most providers have a card of their own. */
export type ProviderCardOf = (providerId: string) => string

const ownCard: ProviderCardOf = providerId => providerId

/**
 * Lists the providers that a module page offers, and the models of each one.
 *
 * The model list shows only the models of the picked provider. So the provider card is the gate of each model:
 * when the provider is not picked, search highlights its card, which is the step to take first.
 * A provider without a card of its own, such as the streaming variant of the official speech provider,
 * shows its models under the card that `cardOf` names.
 *
 * A catalog that the app already loaded is reused. Only a provider without one loads it, as its page does when it opens.
 */
export async function moduleModelItems(module: ModelSearchModule, providers: readonly ProviderMetadata[], cardOf: ProviderCardOf = ownCard): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  await Promise.all(providers.map(async (provider) => {
    if (providerStore.supportsModelListing(provider.id) && providerStore.providerRuntimeState[provider.id]?.modelStatus !== 'ready')
      await providerStore.fetchModelsForProvider(provider.id).catch(() => undefined)
  }))

  return providers.flatMap((provider) => {
    const card = providers.find(candidate => candidate.id === cardOf(provider.id)) ?? provider
    const cardKey = moduleProviderSearchKey(module, card.id)
    return [
      ...(card.id === provider.id ? [{ title: provider.localizedName, key: cardKey }] : []),
      ...providerStore.getModelsForProvider(provider.id).map(model => ({
        title: model.name || model.id,
        key: moduleModelSearchKey(module, provider.id, model.id),
        gates: [cardKey],
        section: card.localizedName,
      })),
    ]
  })
}

/**
 * Lists the voices of the speech providers.
 * A voice shows only under the models that it supports, and a model shows only under its picked provider.
 * So the gates of a voice are the cards of those models, then the card of its provider.
 */
export async function speechVoiceItems(providers: readonly ProviderMetadata[], cardOf: ProviderCardOf = ownCard): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  const speechStore = useSpeechStore()
  const voices = await Promise.all(providers.map(async provider =>
    speechStore.availableVoices[provider.id] ?? await providerStore.listProviderVoices(provider.id).catch(() => undefined) ?? []))

  return providers.flatMap((provider, index) => {
    const card = providers.find(candidate => candidate.id === cardOf(provider.id)) ?? provider
    return voices[index].map(voice => ({
      title: voice.name || voice.id,
      key: speechVoiceSearchKey(provider.id, voice.id),
      gates: [
        ...(voice.compatibleModels ?? []).map(model => moduleModelSearchKey('speech', provider.id, model)),
        moduleProviderSearchKey('speech', card.id),
      ],
      section: card.localizedName,
    }))
  })
}
