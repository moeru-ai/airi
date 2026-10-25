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
  const [models, voices] = await Promise.all([moduleModelItems('speech', providers, cardOf), speechVoiceItems(providers, cardOf)])
  return [...models, ...voices]
}

export default provideSpeechModels
