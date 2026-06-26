import { computedAsync } from '@vueuse/core'
import { computed, ref } from 'vue'

export function useAppRuntime() {
  const isInitialized = ref(false)

  const platform = computedAsync(() => {
    const res = 'electron'
    if (!isInitialized.value) {
      isInitialized.value = true
    }

    return Promise.resolve(res)
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
