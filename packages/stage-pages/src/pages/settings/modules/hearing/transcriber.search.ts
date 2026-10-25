import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems, providerViewItems } from '../module-model-search'

/** Lists the transcription providers of the page, their models, and the settings of the Hearing view that a provider adds. */
const provideTranscription: SettingsSearchProvider = async ({ t }) => {
  const providers = useProviderStore().moduleTranscriptionProvidersMetadata
  const [models, views] = await Promise.all([
    moduleModelItems('transcription', providers),
    providerViewItems('transcription', 'hearing', providers, t),
  ])
  return [...models, ...views]
}

export default provideTranscription
