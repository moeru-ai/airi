import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/official'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems, speechVoiceItems } from './module-model-search'

/** The official card also lists the models and voices of the streaming provider, which has no card of its own. */
function cardOf(providerId: string) {
  return providerId === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID ? OFFICIAL_SPEECH_PROVIDER_ID : providerId
}

/** Lists the speech providers of the page, with their models and voices. The page offers the same providers as cards. */
const provideSpeechModels: SettingsSearchProvider = async () => {
  const providers = useProviderStore().moduleSpeechProvidersMetadata.filter(provider => provider.id !== 'speech-noop')
  // The voices of a provider with a catalog for each model need its model list, so the models load first.
  const models = await moduleModelItems('speech', providers, cardOf)
  return [...models, ...await speechVoiceItems(providers, cardOf)]
}

export default provideSpeechModels
