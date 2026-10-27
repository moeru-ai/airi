import type { SettingsSearchContext, SettingsSearchItem } from '@proj-airi/stage-shared/settings-search'
import type { ProviderMetadata } from '@proj-airi/stage-ui/libs/providers/metadata'
import type { ProviderViews } from '@proj-airi/stage-ui/libs/providers/views'
import type { VoiceInfo } from '@proj-airi/stage-ui/stores/providers/provider'

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

/** Loads the model catalog of each provider that lists its models, as its page does when it opens. A loaded catalog is reused. */
async function loadModelCatalogs(providers: readonly ProviderMetadata[]) {
  const providerStore = useProviderStore()
  await Promise.all(providers.map(async (provider) => {
    if (providerStore.supportsModelListing(provider.id) && providerStore.providerRuntimeState[provider.id]?.modelStatus !== 'ready')
      await providerStore.fetchModelsForProvider(provider.id).catch(() => undefined)
  }))
}

/**
 * Lists the providers that a module page offers, and the models of each one.
 *
 * The model list shows only the models of the picked provider. So the provider card is the gate of each model:
 * when the provider is not picked, search highlights its card, which is the step to take first.
 * A provider without a card of its own, such as the streaming variant of the official speech provider,
 * shows its models under the card that `cardOf` names.
 */
export async function moduleModelItems(module: ModelSearchModule, providers: readonly ProviderMetadata[], cardOf: ProviderCardOf = ownCard): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  await loadModelCatalogs(providers)

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
 * A voice shows only under the models that offer it, and a model shows only under its picked provider.
 * So the gates of a voice are the cards of those models, then the card of its provider.
 *
 * A provider that declares `voicesByModel` has a voice catalog for each model. Its voices come from the catalog of each model,
 * and each voice names the models that list it. Another provider has one catalog, and a voice can name its models itself.
 * The speech page keeps the catalog of one model, so a provider with a catalog for each model reuses it only for that model.
 */
export async function speechVoiceItems(providers: readonly ProviderMetadata[], cardOf: ProviderCardOf = ownCard): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  const speechStore = useSpeechStore()
  await loadModelCatalogs(providers)

  const catalogOf = async (providerId: string, model: string | undefined, byModel: boolean): Promise<VoiceInfo[]> => {
    const cached = speechStore.availableVoices[providerId]
    if (cached && (!byModel || speechStore.voiceCatalogIdentities[providerId]?.model === model))
      return cached
    return await providerStore.listProviderVoices(providerId, model).catch(() => undefined) ?? []
  }

  const items = await Promise.all(providers.map(async (provider) => {
    const card = providers.find(candidate => candidate.id === cardOf(provider.id)) ?? provider
    const byModel = providerStore.findProviderDefinition(provider.id)?.capabilities?.speech?.voicesByModel === true
    const models = byModel ? providerStore.getModelsForProvider(provider.id).map(model => model.id) : []
    const catalogs = models.length
      ? await Promise.all(models.map(async model => ({ model, voices: await catalogOf(provider.id, model, true) })))
      : [{ model: undefined, voices: await catalogOf(provider.id, undefined, byModel) }]

    // Each voice once, with the models whose catalog lists it.
    const voices = new Map<string, { voice: VoiceInfo, models: string[] }>()
    for (const catalog of catalogs) {
      for (const voice of catalog.voices) {
        const entry = voices.get(voice.id) ?? { voice, models: [] }
        if (catalog.model)
          entry.models.push(catalog.model)
        voices.set(voice.id, entry)
      }
    }
    return [...voices.values()].map(({ voice, models: listedBy }) => ({
      title: voice.name || voice.id,
      key: speechVoiceSearchKey(provider.id, voice.id),
      gates: [
        ...(listedBy.length ? listedBy : voice.compatibleModels ?? []).map(model => moduleModelSearchKey('speech', provider.id, model)),
        moduleProviderSearchKey('speech', card.id),
      ],
      section: card.localizedName,
    }))
  }))
  return items.flat()
}

/**
 * Lists the settings of the views that the providers add to a module page, such as the Hearing controls of a transcription provider.
 *
 * Each provider imports the settings of its views with `?settings-search`, so the build-time scan reads them from the view itself.
 * The page shows only the view of the picked provider, so the provider card is the last gate of each setting.
 */
export async function providerViewItems(
  module: ModelSearchModule,
  view: keyof ProviderViews,
  providers: readonly ProviderMetadata[],
  t: SettingsSearchContext['t'],
): Promise<SettingsSearchItem[]> {
  const providerStore = useProviderStore()
  const items = await Promise.all(providers.map(async (provider) => {
    const load = providerStore.findProviderDefinition(provider.id)?.viewSearchEntries?.[view]
    if (!load)
      return []
    const { default: entries } = await load()
    return entries.map(entry => ({
      title: t(entry.key),
      key: entry.key,
      gates: [...entry.gates, moduleProviderSearchKey(module, provider.id)],
      section: provider.localizedName,
    }))
  }))
  return items.flat()
}
