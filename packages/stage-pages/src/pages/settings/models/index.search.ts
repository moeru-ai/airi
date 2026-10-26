import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { MODEL_PICKER_SEARCH_KEY } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'

/**
 * Lists the display models by name. They live in the model picker dialog, so each result points to the button that opens it,
 * as Firefox settings search points to the button of a subdialog.
 */
const provideDisplayModels: SettingsSearchProvider = async ({ t }) => {
  const displayModels = useDisplayModelsStore()
  await displayModels.loadDisplayModelsFromIndexedDB()
  const picker = t('settings.model-select.select-model.button')
  return displayModels.displayModels.map(model => ({ title: model.name, key: MODEL_PICKER_SEARCH_KEY, section: picker }))
}

export default provideDisplayModels
