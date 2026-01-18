import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { converter } from 'culori'
import { defineStore } from 'pinia'

export const DEFAULT_THEME_COLORS_HUE = 220.44

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettingsTheme = defineStore('settings-theme', () => {
  const themeColorsHue = useLocalStorageManualReset<number>('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE)
  const themeColorsHueDynamic = useLocalStorageManualReset<boolean>('settings/theme/colors/hue-dynamic', false)

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

  function resetState() {
    themeColorsHue.reset()
    themeColorsHueDynamic.reset()
  }

  return {
    themeColorsHue,
    themeColorsHueDynamic,
    setThemeColorsHue,
    applyPrimaryColorFrom,
    isColorSelectedForPrimary,
    resetState,
  }
})
