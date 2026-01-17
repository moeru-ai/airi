import { refManualReset, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useSettingsControlsIsland = defineStore('settings-controls-island', () => {
  const allowVisibleOnAllWorkspaces = refManualReset<boolean>(useLocalStorage<boolean>('settings/allow-visible-on-all-workspaces', true))
  const controlsIslandIconSize = refManualReset<'auto' | 'large' | 'small'>(useLocalStorage<'auto' | 'large' | 'small'>('settings/controls-island/icon-size', 'auto'))

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
