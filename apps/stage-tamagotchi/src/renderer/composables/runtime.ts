import { computedAsync } from '@vueuse/core'
import { computed, ref } from 'vue'

export function useAppRuntime() {
  const isInitialized = ref(false)

  const platform = computedAsync(async () => {
    const res = 'electron'
    if (!isInitialized.value) {
      isInitialized.value = true
    }

    return res
  }, 'web')

  const isTauri = computed(() => {
    return platform.value !== 'web'
  })

  return {
    platform,
    isInitialized,
    isTauri,
  }
}
