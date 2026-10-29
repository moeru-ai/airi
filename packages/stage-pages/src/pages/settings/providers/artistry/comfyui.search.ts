import type { SettingsSearchModule } from '@proj-airi/stage-ui/libs/settings-search'

import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'

/** The marker of a saved workflow's row. The page and its module share it. */
export function comfyuiWorkflowSearchKey(id: string) {
  return settingsSearchItemKey('comfyui-workflow', id)
}

/** The ComfyUI page, with the saved workflows by name. */
export default {
  routes: [{
    path: '/settings/providers/artistry/comfyui',
    items: () => useArtistryStore().comfyuiSavedWorkflows.map(workflow => ({ title: workflow.name, key: comfyuiWorkflowSearchKey(workflow.id) })),
  }],
} satisfies SettingsSearchModule
