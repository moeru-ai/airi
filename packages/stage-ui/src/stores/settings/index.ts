import { useTachie } from '@proj-airi/stage-ui-tachie'
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
  const tachie = useTachie()
  const controlsIsland = useSettingsControlsIsland()
  const developer = useSettingsDeveloper()

  async function resetState() {
    await stageModel.resetState()
    analytics.resetState()
    general.resetState()
    spine.resetState()
    tachie.resetState()
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
    // UI settings
    allowVisibleOnAllWorkspaces: controlsIslandRefs.allowVisibleOnAllWorkspaces,
    alwaysOnTop: controlsIslandRefs.alwaysOnTop,
    analyticsEnabled: analyticsRefs.analyticsEnabled,
    applyPrimaryColorFrom: theme.applyPrimaryColorFrom,
    controlsIslandIconSize: controlsIslandRefs.controlsIslandIconSize,

    // Core settings
    disableTransitions: generalRefs.disableTransitions,
    initializeStageModel: stageModel.initializeStageModel,
    inspectUpdaterDiagnostics: developerRefs.inspectUpdaterDiagnostics,
    isColorSelectedForPrimary: theme.isColorSelectedForPrimary,
    language: generalRefs.language,

    resetState,
    restoreBuiltInStageModelRenderer: stageModel.restoreBuiltInStageModelRenderer,
    setStageModelRenderer: stageModel.setStageModelRenderer,
    // Methods
    setThemeColorsHue: theme.setThemeColorsHue,
    spineDefaultMixDuration: spineRefs.spineDefaultMixDuration,

    spineIdleAnimationEnabled: spineRefs.spineIdleAnimationEnabled,
    spineMaxFps: spineRefs.spineMaxFps,

    // Spine settings
    spinePremultipliedAlpha: spineRefs.spinePremultipliedAlpha,
    spineRenderScale: spineRefs.spineRenderScale,
    // Stage model settings
    stageModelRenderer: stageModelRefs.stageModelRenderer,
    stageModelSelected: stageModelRefs.stageModelSelected,

    stageModelSelectedDisplayModel: stageModelRefs.stageModelSelectedDisplayModel,
    stageModelSelectedUrl: stageModelRefs.stageModelSelectedUrl,
    stageViewControlsEnabled: stageModelRefs.stageViewControlsEnabled,
    // Theme settings
    themeColorsHue: themeRefs.themeColorsHue,
    themeColorsHueDynamic: themeRefs.themeColorsHueDynamic,
    updateStageModel: stageModel.updateStageModel,
    usePageSpecificTransitions: generalRefs.usePageSpecificTransitions,
    websocketSecureEnabled: generalRefs.websocketSecureEnabled,
  }
})
