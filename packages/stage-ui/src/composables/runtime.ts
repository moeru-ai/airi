import { computed } from 'vue'

export function useTauri() {
  const isTauri = computed(() => {
    if ('window' in globalThis && globalThis.window != null) {
      if ('__TAURI__' in globalThis.window && globalThis.window.__TAURI__ != null) {
        return true
      }
    }

    return false
  })

  return {
    isTauri,
    isWeb: computed(() => !isTauri.value),
  }
}

export function useAppRuntime() {
  const { isTauri, isWeb } = useTauri()
  const platform = computed(() => {
    if (isTauri.value) {
      if ('window' in globalThis && globalThis.window != null) {
        // https://github.com/tauri-apps/plugins-workspace/blob/fe01894e7f32a2a615081f62f612b755ea79f1c8/plugins/os/guest-js/index.ts#L66-L81
        if ('__TAURI_OS_PLUGIN_INTERNALS__' in globalThis.window && globalThis.window.__TAURI_OS_PLUGIN_INTERNALS__ != null) {
          const internal = globalThis.window.__TAURI_OS_PLUGIN_INTERNALS__ as Record<string, unknown>
          return internal.platform || 'unknown'
        }
      }
    }

    return 'web'
  })

  const runtime = computed(() => {
    if (isTauri.value) {
      return 'tauri'
    }
    else if (isWeb.value) {
      return 'web'
    }
    else {
      return 'unknown'
    }
  })

  return {
    isTauri,
    isWeb,
    platform,
    runtime,
  }
}
