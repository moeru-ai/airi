import { defineStore, storeToRefs } from 'pinia'

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

  // Extract refs from sub-stores to maintain proper reactivity
  const generalRefs = storeToRefs(general)
  const stageModelRefs = storeToRefs(stageModel)
  const live2dRefs = storeToRefs(live2d)
  const themeRefs = storeToRefs(theme)
  const controlsIslandRefs = storeToRefs(controlsIsland)

  return {
    // Core settings
    disableTransitions: generalRefs.disableTransitions,
    usePageSpecificTransitions: generalRefs.usePageSpecificTransitions,
    language: generalRefs.language,

    // Stage model settings
    stageModelRenderer: stageModelRefs.stageModelRenderer,
    stageModelSelected: stageModelRefs.stageModelSelected,
    stageModelSelectedUrl: stageModelRefs.stageModelSelectedUrl,
    stageModelSelectedDisplayModel: stageModelRefs.stageModelSelectedDisplayModel,
    stageViewControlsEnabled: stageModelRefs.stageViewControlsEnabled,

    // Live2D settings
    live2dDisableFocus: live2dRefs.live2dDisableFocus,
    live2dIdleAnimationEnabled: live2dRefs.live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled: live2dRefs.live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled: live2dRefs.live2dForceAutoBlinkEnabled,
    live2dShadowEnabled: live2dRefs.live2dShadowEnabled,

    // Theme settings
    themeColorsHue: themeRefs.themeColorsHue,
    themeColorsHueDynamic: themeRefs.themeColorsHueDynamic,

    // UI settings
    allowVisibleOnAllWorkspaces: controlsIslandRefs.allowVisibleOnAllWorkspaces,
    controlsIslandIconSize: controlsIslandRefs.controlsIslandIconSize,

    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    initializeStageModel: stageModel.initializeStageModel,
    updateStageModel: stageModel.updateStageModel,
    resetState,
  }
})
