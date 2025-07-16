import { useDevicesList, useLocalStorage } from '@vueuse/core'
import { converter } from 'culori'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const DEFAULT_THEME_COLORS_HUE = 220.44

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettings = defineStore('settings', () => {
  const selectedAudioDevice = ref<MediaDeviceInfo>()

  const language = useLocalStorage('settings/language', 'en')
  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')

  const isAudioInputOn = useLocalStorage('settings/audio/input', 'false')
  const selectedAudioDeviceId = computed(() => selectedAudioDevice.value?.deviceId)
  const { audioInputs, ensurePermissions } = useDevicesList({ constraints: { audio: true } })

  const disableTransitions = useLocalStorage('settings/disable-transitions', true)
  const usePageSpecificTransitions = useLocalStorage('settings/use-page-specific-transitions', true)

  const themeColorsHue = useLocalStorage('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE)
  const themeColorsHueDynamic = useLocalStorage('settings/theme/colors/hue-dynamic', false)

  const allowVisibleOnAllWorkspaces = useLocalStorage('settings/allow-visible-on-all-workspaces', true)

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

  watch(isAudioInputOn, (value) => {
    if (value === 'false') {
      selectedAudioDevice.value = undefined
    }
    if (value === 'true') {
      ensurePermissions().then(() => {
        selectedAudioDevice.value = audioInputs.value[0]
      })
    }
  })

  watch(audioInputs, () => {
    if (isAudioInputOn.value === 'true' && !selectedAudioDevice.value) {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  }, { immediate: true })

  return {
    disableTransitions,
    usePageSpecificTransitions,
    language,
    stageView,
    themeColorsHue,
    themeColorsHueDynamic,
    isAudioInputOn,
    selectedAudioDevice,
    selectedAudioDeviceId,

    allowVisibleOnAllWorkspaces,

    setThemeColorsHue,
    applyPrimaryColorFrom,
    isColorSelectedForPrimary,
  }
})
