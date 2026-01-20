import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'

import { useSettings } from '../stores/settings'

/**
 * Syncs theme-related CSS side effects (chromatic hue + dynamic hue animation)
 * with the current settings store. Intended to be called once near app entry
 * per BrowserWindow (main app, overlays, devtools).
 */
export function useStageThemeSync() {
  const doc = typeof document === 'undefined' ? null : document
  const settings = useSettings()
  const { themeColorsHue, themeColorsHueDynamic } = storeToRefs(settings)

  // Ensure dark mode class handling stays consistent across windows
  // (useTheme wires useDark to documentElement).
  useTheme()

  const applyHue = () => doc?.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
  const applyDynamicHueClass = () => doc?.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)

  onMounted(() => {
    applyHue()
    applyDynamicHueClass()
  })

  watch(themeColorsHue, applyHue, { immediate: true })
  watch(themeColorsHueDynamic, applyDynamicHueClass, { immediate: true })

  return {
    themeColorsHue,
    themeColorsHueDynamic,
  }
}
