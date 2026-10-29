import type { ProviderMetadata } from '@proj-airi/stage-ui/libs/providers/metadata'
import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { providerSettingsRouteOf } from '@proj-airi/stage-ui/libs/providers/metadata'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

/**
 * The providers page, and the page of each provider by the name that the providers page shows.
 * A provider page opens the route that its card opens, so a result and the card open the same place.
 * Some providers keep their settings on a module page, such as a local transcriber on the speech recognition page.
 * Such a provider is a result of its own under that page.
 */
export default {
  routes: ['/settings/providers'],
  pages: ({ t }) => {
    const providerStore = useProviderStore()
    const kinds: Array<[string, ProviderMetadata[]]> = [
      ['chat', providerStore.allChatProvidersMetadata],
      ['vision', providerStore.allVisionProvidersMetadata],
      ['speech', providerStore.allAudioSpeechProvidersMetadata],
      ['transcription', providerStore.allAudioTranscriptionProvidersMetadata],
    ]
    return kinds.flatMap(([kind, providers]) => providers
      // The providers page hides the No Speech choice. It has no settings.
      .filter(provider => provider.id !== 'speech-noop')
      .map(provider => ({
        to: providerSettingsRouteOf(provider),
        title: provider.localizedName,
        section: t(`settings.pages.providers.categories.${kind}.title`),
      })))
  },
} satisfies SettingsSearchModule
