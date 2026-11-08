import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { useModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { listSherpawModelAssets } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'

import { downloadedModelSearchKey, downloadedModelsOf } from './downloaded-models'

/** The data page, with the downloaded speech models. It reads their state first, as the page does when it opens. */
export default {
  routes: [{
    path: '/settings/data',
    items: async ({ t }) => {
      await listSherpawModelAssets()
      return downloadedModelsOf(useModelAssetStatus().models.value, t)
        .map(model => ({ title: model.name, key: downloadedModelSearchKey(model.id) }))
    },
  }],
} satisfies SettingsSearchModule
