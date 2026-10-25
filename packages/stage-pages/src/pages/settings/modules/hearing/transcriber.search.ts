import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems } from '../module-model-search'

/** Lists the transcription providers of the page and their models. */
const provideTranscriptionModels: SettingsSearchProvider = () =>
  moduleModelItems('transcription', useProviderStore().moduleTranscriptionProvidersMetadata)

export default provideTranscriptionModels
