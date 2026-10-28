import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { MODEL_PICKER_SEARCH_KEY } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'

/**
 * The models page, with the display models by name. They live in the model picker dialog, so each result points to the button
 * that opens it, as Firefox settings search points to the button of a subdialog.
 */
export default {
  routes: [{
    path: '/settings/models',
    items: async ({ t }) => {
      const displayModels = useDisplayModelsStore()
      await displayModels.loadDisplayModelsFromIndexedDB()
      const picker = t('settings.model-select.select-model.button')
      return displayModels.displayModels.map(model => ({ title: model.name, key: MODEL_PICKER_SEARCH_KEY, section: picker }))
    },
  }],
} satisfies SettingsSearchModule
