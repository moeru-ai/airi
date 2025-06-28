import { computedAsync } from '@vueuse/core'
import { computed, ref } from 'vue'

async function getTauri() {
  try {
    const os = await import('@tauri-apps/plugin-os')
    return os
  }
  catch {
    return null
  }
}

export function useAppRuntime() {
  const isInitialized = ref(false)

  const platform = computedAsync(async () => {
    const res = (await getTauri())?.platform?.() || 'web'
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
