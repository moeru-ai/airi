import { computedAsync } from '@vueuse/core'
import { onMounted, ref } from 'vue'

async function getTauri() {
  try {
    const os = await import('@tauri-apps/plugin-os')
    return os
  }
  catch {
    return null
  }
}

async function getTauriOSPluginInternal() {
  const os = await import('@tauri-apps/plugin-os')
  return os
}

export function useAppRuntime() {
  const isTauri = ref<boolean>(false)

  const platform = computedAsync(async () => {
    if (!isTauri.value) {
      return 'web'
    }

    return (await getTauriOSPluginInternal())?.platform?.() || 'web'
  })

  onMounted(async () => {
    isTauri.value = (await getTauri()) != null
  })

  return {
    platform,
  }
}
