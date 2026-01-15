import type { DisplayModel } from './display-models'

import messages from '@proj-airi/i18n/locales'

import { refManualReset, useEventListener, useLocalStorage } from '@vueuse/core'
import { converter } from 'culori'
import { defineStore } from 'pinia'
import { onMounted, watch } from 'vue'

import { useAudioDevice } from './audio'
import { DisplayModelFormat, useDisplayModelsStore } from './display-models'

const languageRemap: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-HK': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-Hant': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en': 'en',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
  'es': 'es',
  'ru': 'ru',
  'ru-RU': 'ru',
  'fr': 'fr',
  'fr-FR': 'fr',
  'ja': 'ja',
  'ja-JP': 'ja',
}

export const DEFAULT_THEME_COLORS_HUE = 220.44

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettings = defineStore('settings', () => {
  const displayModelsStore = useDisplayModelsStore()

  const language = refManualReset<string>(useLocalStorage('settings/language', ''))

  const stageModelSelected = refManualReset<string | undefined>(useLocalStorage('settings/stage/model', 'preset-live2d-1'))
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelRenderer = refManualReset<'live2d' | 'vrm' | 'disabled' | undefined>(undefined)

  async function updateStageModel() {
    if (!stageModelSelected.value) {
      stageModelSelectedUrl.value = undefined
      stageModelSelectedDisplayModel.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    const model = await displayModelsStore.getDisplayModel(stageModelSelected.value)
    if (!model) {
      stageModelSelectedUrl.value = undefined
      stageModelSelectedDisplayModel.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    switch (model.format) {
      case DisplayModelFormat.Live2dZip:
        stageModelRenderer.value = 'live2d'
        break
      case DisplayModelFormat.VRM:
        stageModelRenderer.value = 'vrm'
        break
      default:
        stageModelRenderer.value = 'disabled'
        break
    }

    if (model.type === 'file') {
      if (stageModelSelectedUrl.value) {
        URL.revokeObjectURL(stageModelSelectedUrl.value)
      }

      stageModelSelectedUrl.value = URL.createObjectURL(model.file)
    }
    else {
      stageModelSelectedUrl.value = model.url
    }

    stageModelSelectedDisplayModel.value = model
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  useEventListener('unload', () => {
    if (stageModelSelectedUrl.value) {
      URL.revokeObjectURL(stageModelSelectedUrl.value)
    }
  })

  const stageViewControlsEnabled = refManualReset<boolean>(false)

  const live2dDisableFocus = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/disable-focus', false))
  const live2dIdleAnimationEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/idle-animation-enabled', true))
  const live2dAutoBlinkEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/auto-blink-enabled', true))
  const live2dForceAutoBlinkEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/force-auto-blink-enabled', false))
  const live2dShadowEnabled = refManualReset<boolean>(useLocalStorage<boolean>('settings/live2d/shadow-enabled', true))

  const disableTransitions = refManualReset<boolean>(useLocalStorage<boolean>('settings/disable-transitions', true))
  const usePageSpecificTransitions = refManualReset<boolean>(useLocalStorage<boolean>('settings/use-page-specific-transitions', true))

  const themeColorsHue = refManualReset<number>(useLocalStorage<number>('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE))
  const themeColorsHueDynamic = refManualReset<boolean>(useLocalStorage<boolean>('settings/theme/colors/hue-dynamic', false))

  const allowVisibleOnAllWorkspaces = refManualReset<boolean>(useLocalStorage<boolean>('settings/allow-visible-on-all-workspaces', true))

  const controlsIslandIconSize = refManualReset(useLocalStorage<'auto' | 'large' | 'small'>('settings/controls-island/icon-size', 'auto'))

  function getLanguage() {
    let language = localStorage.getItem('settings/language')

    if (!language) {
      // Fallback to browser language
      language = navigator.language || 'en'
    }

    const languages = Object.keys(messages!)
    if (languageRemap[language || 'en'] != null) {
      language = languageRemap[language || 'en']
    }
    if (language && languages.includes(language))
      return language

    return 'en'
  }

  function setThemeColorsHue(hue = DEFAULT_THEME_COLORS_HUE) {
    themeColorsHue.value = hue
    themeColorsHueDynamic.value = false
  }

  function applyPrimaryColorFrom(color?: string) {
    setThemeColorsHue(getHueFrom(color))
  }

  /**
   * Check if a color is currently selected based on its hue value
   * @param hexColor Hex color code to check
   * @returns True if the color's hue matches the current theme hue
   */
  function isColorSelectedForPrimary(hexColor?: string) {
    // If dynamic coloring is enabled, no preset color is manually selected
    if (themeColorsHueDynamic.value)
      return false

    // Convert hex color to OKLCH
    const h = getHueFrom(hexColor)
    if (!h)
      return false

    // Compare hue values with a small tolerance for floating point comparison
    const hueDifference = Math.abs(h - themeColorsHue.value)
    return hueDifference < 0.01 || hueDifference > 359.99
  }

  async function resetState() {
    if (stageModelSelectedUrl.value)
      URL.revokeObjectURL(stageModelSelectedUrl.value)

    language.reset()
    stageModelSelected.reset()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelRenderer.reset()
    stageViewControlsEnabled.reset()

    live2dDisableFocus.reset()
    live2dIdleAnimationEnabled.reset()
    live2dAutoBlinkEnabled.reset()
    live2dForceAutoBlinkEnabled.reset()
    live2dShadowEnabled.reset()

    disableTransitions.reset()
    usePageSpecificTransitions.reset()

    themeColorsHue.reset()
    themeColorsHueDynamic.reset()

    allowVisibleOnAllWorkspaces.reset()
    controlsIslandIconSize.reset()

    await updateStageModel()
  }

  onMounted(() => language.value = getLanguage())

  return {
    disableTransitions,
    usePageSpecificTransitions,
    language,

    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedDisplayModel,
    stageViewControlsEnabled,

    live2dDisableFocus,
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    live2dShadowEnabled,
    themeColorsHue,
    themeColorsHueDynamic,

    allowVisibleOnAllWorkspaces,
    controlsIslandIconSize,

    setThemeColorsHue,
    applyPrimaryColorFrom,
    isColorSelectedForPrimary,
    initializeStageModel,
    updateStageModel,
    resetState,
  }
})

export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const { audioInputs, deviceConstraints, selectedAudioInput: selectedAudioInputNonPersist, startStream, stopStream, stream, askPermission } = useAudioDevice()

  const selectedAudioInputPersist = refManualReset<string>(useLocalStorage('settings/audio/input', selectedAudioInputNonPersist.value))
  const selectedAudioInputEnabledPersist = refManualReset<boolean>(useLocalStorage('settings/audio/input/enabled', false))

  watch(selectedAudioInputPersist, (newValue) => {
    selectedAudioInputNonPersist.value = newValue
  })

  watch(selectedAudioInputEnabledPersist, (val) => {
    if (val) {
      startStream()
    }
    else {
      stopStream()
    }
  })

  onMounted(() => {
    const hasSelectedInput = selectedAudioInputPersist.value
      && audioInputs.value.some(device => device.deviceId === selectedAudioInputPersist.value)

    if (selectedAudioInputEnabledPersist.value && hasSelectedInput) {
      startStream()
    }
    if (selectedAudioInputNonPersist.value && !selectedAudioInputEnabledPersist.value) {
      selectedAudioInputPersist.value = selectedAudioInputNonPersist.value
    }
  })

  function resetState() {
    selectedAudioInputPersist.reset()
    selectedAudioInputNonPersist.value = ''
    selectedAudioInputEnabledPersist.reset()
    stopStream()
  }

  return {
    audioInputs,
    deviceConstraints,
    selectedAudioInput: selectedAudioInputPersist,
    enabled: selectedAudioInputEnabledPersist,

    stream,

    askPermission,
    startStream,
    stopStream,
    resetState,
  }
})
