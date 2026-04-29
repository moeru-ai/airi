import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

export function useBreakpoints() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isMobile = computed(() => !isDesktop.value)

  return { isDesktop, isMobile }
}
