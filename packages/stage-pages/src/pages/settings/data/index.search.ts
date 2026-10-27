import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { useModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { listSherpawModelAssets } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'

import { downloadedModelSearchKey, downloadedModelsOf } from './downloaded-models'

/** Lists the downloaded speech models. It reads their state first, as the data page does when it opens. */
const provideDownloadedModels: SettingsSearchProvider = async ({ t }) => {
  await listSherpawModelAssets()
  return downloadedModelsOf(useModelAssetStatus().models.value, t)
    .map(model => ({ title: model.name, key: downloadedModelSearchKey(model.id) }))
}

export default provideDownloadedModels
