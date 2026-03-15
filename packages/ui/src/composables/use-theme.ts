import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark({
  disableTransition: true,
})

const toggleDark = useToggle(isDark)

export function useTheme() {
  return {
    isDark,
    toggleDark,
  }
}
