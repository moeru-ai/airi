import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { moduleModelItems } from './module-model-search'

/** Lists the chat providers of the page and their models. */
const provideChatModels: SettingsSearchProvider = () =>
  moduleModelItems('consciousness', useProviderStore().moduleChatProvidersMetadata)

export default provideChatModels
