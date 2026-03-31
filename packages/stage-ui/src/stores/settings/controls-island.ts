import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export const useSettingsControlsIsland = defineStore('settings-controls-island', () => {
  const allowVisibleOnAllWorkspaces = useLocalStorageManualReset<boolean>('settings/allow-visible-on-all-workspaces', true)
  const alwaysOnTop = useLocalStorageManualReset<boolean>('settings/always-on-top', true)
  const controlsIslandIconSize = useLocalStorageManualReset<'auto' | 'large' | 'small'>('settings/controls-island/icon-size', 'auto')
  const autoHideControlsIsland = useLocalStorageManualReset<boolean>('settings/controls-island/auto-hide', false)
  const autoHideDelay = useLocalStorageManualReset<number>('settings/controls-island/auto-hide-delay', 0.5)
  const autoShowDelay = useLocalStorageManualReset<number>('settings/controls-island/auto-show-delay', 0.5)
  const autoHideOpacity = useLocalStorageManualReset<number>('settings/controls-island/auto-hide-opacity', 30)

  function resetState() {
    allowVisibleOnAllWorkspaces.reset()
    alwaysOnTop.reset()
    controlsIslandIconSize.reset()
    autoHideControlsIsland.reset()
    autoHideDelay.reset()
    autoShowDelay.reset()
    autoHideOpacity.reset()
  }

  return {
    allowVisibleOnAllWorkspaces,
    alwaysOnTop,
    controlsIslandIconSize,
    autoHideControlsIsland,
    autoHideDelay,
    autoShowDelay,
    autoHideOpacity,
    resetState,
  }
})
