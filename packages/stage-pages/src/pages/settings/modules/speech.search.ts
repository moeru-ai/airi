import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/official'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems, speechVoiceItems } from './module-model-search'

/** Lists the speech providers of the page, with their models and voices. The page offers the same providers as cards. */
const provideSpeechModels: SettingsSearchProvider = async () => {
  const providers = useProviderStore().moduleSpeechProvidersMetadata.filter(provider => provider.id !== 'speech-noop' && provider.id !== OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
  const [models, voices] = await Promise.all([moduleModelItems('speech', providers), speechVoiceItems(providers)])
  return [...models, ...voices]
}

export default provideSpeechModels
