import type { SettingsSearchProvider } from '@proj-airi/stage-shared/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'

/** The marker of a saved workflow's row. The page and the provider share it. */
export function comfyuiWorkflowSearchKey(id: string) {
  return settingsSearchItemKey('comfyui-workflow', id)
}

/** Lists the saved ComfyUI workflows by name. */
const provideWorkflows: SettingsSearchProvider = () =>
  useArtistryStore().comfyuiSavedWorkflows.map(workflow => ({ title: workflow.name, key: comfyuiWorkflowSearchKey(workflow.id) }))

export default provideWorkflows
