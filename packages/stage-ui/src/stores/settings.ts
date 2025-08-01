import messages from '@proj-airi/i18n/locales'

import { useLocalStorage } from '@vueuse/core'
import { converter } from 'culori'
import { defineStore } from 'pinia'
import { onMounted, ref, watch } from 'vue'

import { useAudioDevice } from './audio'

const languageRemap: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-HK': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'zh-Hant': 'zh-Hans', // TODO: remove this when zh-Hant is supported
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en': 'en',
}

export const DEFAULT_THEME_COLORS_HUE = 220.44

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettings = defineStore('settings', () => {
  const selectedAudioDevice = ref<MediaDeviceInfo>()

  const language = useLocalStorage('settings/language', '')

  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')
  const stageViewControlsEnabled = ref(false)
  const live2dDisableFocus = useLocalStorage('settings/live2d/disable-focus', false)

  const disableTransitions = useLocalStorage('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorage('settings/use-page-specific-transitions', true)

  const themeColorsHue = useLocalStorage('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE)
  const themeColorsHueDynamic = useLocalStorage('settings/theme/colors/hue-dynamic', false)

  const allowVisibleOnAllWorkspaces = useLocalStorage('settings/allow-visible-on-all-workspaces', true)

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

  onMounted(() => {
    language.value = getLanguage()
  })

  return {
    disableTransitions,
    usePageSpecificTransitions,
    language,
    stageView,
    live2dDisableFocus,
    stageViewControlsEnabled,
    themeColorsHue,
    themeColorsHueDynamic,
    selectedAudioDevice,

    allowVisibleOnAllWorkspaces,

    setThemeColorsHue,
    applyPrimaryColorFrom,
    isColorSelectedForPrimary,
  }
})

export const useSettingsAudioDevice = defineStore('settings-audio-devices', () => {
  const { audioInputs, deviceConstraints, selectedAudioInput: selectedAudioInputNonPersist, startStream, stopStream, stream, askPermission } = useAudioDevice()

  const selectedAudioInputPersist = useLocalStorage('settings/audio/input', selectedAudioInputNonPersist.value)
  const selectedAudioInputEnabledPersist = useLocalStorage('settings/audio/input-enabled', false)

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
    if (selectedAudioInputEnabledPersist.value && selectedAudioInputPersist.value) {
      startStream()
    }
    if (selectedAudioInputNonPersist.value && !selectedAudioInputEnabledPersist.value) {
      selectedAudioInputPersist.value = selectedAudioInputNonPersist.value
    }
  })

  return {
    audioInputs,
    deviceConstraints,
    selectedAudioInput: selectedAudioInputPersist,
    enabled: selectedAudioInputEnabledPersist,

    stream,

    askPermission,
    startStream,
    stopStream,
  }
})
