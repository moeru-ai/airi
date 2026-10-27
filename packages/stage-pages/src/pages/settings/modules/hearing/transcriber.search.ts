import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems, providerViewItems } from '../module-model-search'

/** The speech recognition page, with its transcription providers, their models, and the settings of the Hearing view that a provider adds. */
export default {
  routes: [{
    path: '/settings/modules/hearing/transcriber',
    items: async ({ t }) => {
      const providers = useProviderStore().moduleTranscriptionProvidersMetadata
      const [models, views] = await Promise.all([
        moduleModelItems('transcription', providers),
        providerViewItems('transcription', 'hearing', providers, t),
      ])
      return [...models, ...views]
    },
  }],
} satisfies SettingsSearchModule
