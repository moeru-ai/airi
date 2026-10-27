import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems } from './module-model-search'

/** Lists the vision providers of the page and their models. */
const provideVisionModels: SettingsSearchProvider = () =>
  moduleModelItems('vision', useProviderStore().moduleVisionProvidersMetadata)

export default provideVisionModels
