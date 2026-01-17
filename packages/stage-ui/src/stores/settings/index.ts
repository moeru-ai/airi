import { defineStore } from 'pinia'

import { useSettingsAudioDevice } from './audio-device'
import { useSettingsControlsIsland } from './controls-island'
import { useSettingsGeneral } from './general'
import { useSettingsLive2d } from './live2d'
import { useSettingsStageModel } from './stage-model'
import { useSettingsTheme } from './theme'

// Export sub-stores
export * from './audio-device'
export * from './controls-island'
export * from './general'
export * from './live2d'
export * from './stage-model'
export * from './theme'
// Export constants
export { DEFAULT_THEME_COLORS_HUE } from './theme'

/**
 * Unified settings store for backward compatibility.
 * This aggregates all sub-stores into one interface.
 *
 * @deprecated Use individual setting stores (useSettingsCore, useSettingsTheme, etc.) instead.
 * This store exists only for backward compatibility and will be removed in a future version.
 */
export const useSettings = defineStore('settings', () => {
  const general = useSettingsGeneral()
  const stageModel = useSettingsStageModel()
  const live2d = useSettingsLive2d()
  const theme = useSettingsTheme()
  const controlsIsland = useSettingsControlsIsland()

  async function resetState() {
    await stageModel.resetState()
    general.resetState()
    live2d.resetState()
    theme.resetState()
    controlsIsland.resetState()
  }

  return {
    // Core settings
    disableTransitions: general.disableTransitions,
    usePageSpecificTransitions: general.usePageSpecificTransitions,
    language: general.language,

    // Stage model settings
    stageModelRenderer: stageModel.stageModelRenderer,
    stageModelSelected: stageModel.stageModelSelected,
    stageModelSelectedUrl: stageModel.stageModelSelectedUrl,
    stageModelSelectedDisplayModel: stageModel.stageModelSelectedDisplayModel,
    stageViewControlsEnabled: stageModel.stageViewControlsEnabled,

    // Live2D settings
    live2dDisableFocus: live2d.live2dDisableFocus,
    live2dIdleAnimationEnabled: live2d.live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled: live2d.live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled: live2d.live2dForceAutoBlinkEnabled,
    live2dShadowEnabled: live2d.live2dShadowEnabled,

    // Theme settings
    themeColorsHue: theme.themeColorsHue,
    themeColorsHueDynamic: theme.themeColorsHueDynamic,

    // UI settings
    allowVisibleOnAllWorkspaces: controlsIsland.allowVisibleOnAllWorkspaces,
    controlsIslandIconSize: controlsIsland.controlsIslandIconSize,

    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    initializeStageModel: stageModel.initializeStageModel,
    updateStageModel: stageModel.updateStageModel,
    resetState,
  }
})

// Re-export useSettingsAudioDevice for convenience
export { useSettingsAudioDevice }
