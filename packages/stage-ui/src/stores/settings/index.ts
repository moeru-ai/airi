import { defineStore, storeToRefs } from 'pinia'

import { useSettingsAnalytics } from './analytics'
import { useSettingsControlsIsland } from './controls-island'
import { useSettingsDeveloper } from './developer'
import { useSettingsGeneral } from './general'
import { useSettingsSpine } from './spine'
import { useSettingsStageModel } from './stage-model'
import { useSettingsTheme } from './theme'

export * from './analytics'
// Export sub-stores
export * from './audio-device'
export * from './beat-sync'
export * from './controls-island'
export * from './developer'
export * from './general'
export * from './spine'
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
  const analytics = useSettingsAnalytics()
  const stageModel = useSettingsStageModel()
  const spine = useSettingsSpine()
  const theme = useSettingsTheme()
  const controlsIsland = useSettingsControlsIsland()
  const developer = useSettingsDeveloper()

  async function resetState() {
    await stageModel.resetState()
    analytics.resetState()
    general.resetState()
    spine.resetState()
    theme.resetState()
    controlsIsland.resetState()
    developer.resetState()
  }

  // Extract refs from sub-stores to maintain proper reactivity
  const generalRefs = storeToRefs(general)
  const analyticsRefs = storeToRefs(analytics)
  const stageModelRefs = storeToRefs(stageModel)
  const spineRefs = storeToRefs(spine)
  const themeRefs = storeToRefs(theme)
  const controlsIslandRefs = storeToRefs(controlsIsland)
  const developerRefs = storeToRefs(developer)

  return {
    // Core settings
    disableTransitions: generalRefs.disableTransitions,
    usePageSpecificTransitions: generalRefs.usePageSpecificTransitions,
    language: generalRefs.language,
    analyticsEnabled: analyticsRefs.analyticsEnabled,
    websocketSecureEnabled: generalRefs.websocketSecureEnabled,

    // Stage model settings
    stageModelRenderer: stageModelRefs.stageModelRenderer,
    stageModelSelected: stageModelRefs.stageModelSelected,
    stageModelSelectedUrl: stageModelRefs.stageModelSelectedUrl,
    stageModelSelectedDisplayModel: stageModelRefs.stageModelSelectedDisplayModel,
    stageViewControlsEnabled: stageModelRefs.stageViewControlsEnabled,

    // Spine settings
    spinePremultipliedAlpha: spineRefs.spinePremultipliedAlpha,
    spineDefaultMixDuration: spineRefs.spineDefaultMixDuration,
    spineIdleAnimationEnabled: spineRefs.spineIdleAnimationEnabled,
    spineMaxFps: spineRefs.spineMaxFps,
    spineRenderScale: spineRefs.spineRenderScale,

    // Theme settings
    themeColorsHue: themeRefs.themeColorsHue,
    themeColorsHueDynamic: themeRefs.themeColorsHueDynamic,

    // UI settings
    allowVisibleOnAllWorkspaces: controlsIslandRefs.allowVisibleOnAllWorkspaces,
    alwaysOnTop: controlsIslandRefs.alwaysOnTop,
    controlsIslandIconSize: controlsIslandRefs.controlsIslandIconSize,
    inspectUpdaterDiagnostics: developerRefs.inspectUpdaterDiagnostics,

    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    initializeStageModel: stageModel.initializeStageModel,
    restoreBuiltInStageModelRenderer: stageModel.restoreBuiltInStageModelRenderer,
    setStageModelRenderer: stageModel.setStageModelRenderer,
    updateStageModel: stageModel.updateStageModel,
    resetState,
  }
})
