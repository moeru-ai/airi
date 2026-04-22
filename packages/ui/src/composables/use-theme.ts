import { useDark, useToggle } from '@vueuse/core'

import { LocalStorageShim } from '../utils'

const isDark = useDark({
  disableTransition: true,
  // NOTICE: for histoire, used in packages/stage-ui, localStorage global variable exists but `storage.getItem is not a function` wil
  // thrown, here we added LocalStorageShim to avoid this issue, and it will fallback to real localStorage when it's available.
  storage: 'localStorage' in globalThis && localStorage != null && 'getItem' in localStorage && typeof localStorage.getItem === 'function' ? localStorage : new LocalStorageShim(),
})

const toggleDark = useToggle(isDark)

export function useTheme() {
  return {
    isDark,
    toggleDark,
  }
}
