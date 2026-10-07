import type { BasicColorSchema } from '@vueuse/core'

import { useColorMode, useToggle } from '@vueuse/core'
import { computed } from 'vue'

import { LocalStorageShim } from '../utils'

/** The theme that the user chose. `auto` follows the color scheme of the system. */
export type ThemeMode = BasicColorSchema

// The classes are the ones of `useDark`: `dark` on the root element, and none for light.
const colorMode = useColorMode({
  modes: { dark: 'dark', light: '' },
  disableTransition: true,
  // NOTICE: for histoire, used in packages/stage-ui, localStorage global variable exists but `storage.getItem is not a function` wil
  // thrown, here we added LocalStorageShim to avoid this issue, and it will fallback to real localStorage when it's available.
  storage: 'localStorage' in globalThis && localStorage != null && 'getItem' in localStorage && typeof localStorage.getItem === 'function' ? localStorage : new LocalStorageShim(),
})

/**
 * Whether the dark theme shows now. A two-state toggle writes it, and selects
 * the light or the dark theme. Only a three-state control selects `auto`.
 */
const isDark = computed({
  get: () => colorMode.state.value === 'dark',
  set: (dark) => {
    colorMode.store.value = dark ? 'dark' : 'light'
  },
})

const toggleDark = useToggle(isDark)

/** The theme that a three-state theme control selects next. */
const nextThemeModes = {
  light: 'dark',
  dark: 'auto',
  auto: 'light',
} as const satisfies Record<ThemeMode, ThemeMode>

const nextThemeMode = computed(() => nextThemeModes[colorMode.store.value])

/** Selects the next theme: light, dark, then the system scheme. */
function cycleThemeMode() {
  colorMode.store.value = nextThemeMode.value
}

export function useTheme() {
  return {
    isDark,
    toggleDark,
    /** The chosen theme, which a three-state control reads and writes. */
    themeMode: colorMode.store,
    /** The theme that {@link cycleThemeMode} selects. */
    nextThemeMode,
    cycleThemeMode,
  }
}
