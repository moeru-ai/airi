import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsControlsIsland = defineStore('settings-controls-island', () => {
  const allowVisibleOnAllWorkspaces = useLocalStorageManualReset<boolean>('settings/allow-visible-on-all-workspaces', true)
  const controlsIslandIconSize = useLocalStorageManualReset<'auto' | 'large' | 'small'>('settings/controls-island/icon-size', 'auto')

  function resetState() {
    allowVisibleOnAllWorkspaces.reset()
    controlsIslandIconSize.reset()
  }

  return {
    allowVisibleOnAllWorkspaces,
    controlsIslandIconSize,
    resetState,
  }
})
