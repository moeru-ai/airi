import type {
  ScreenAmbientLightDiagnosticsChannelEvent,
  ScreenAmbientLightDiagnosticsSnapshot,
} from '../../shared/screen-ambient-light-diagnostics'

import { useBroadcastChannel } from '@vueuse/core'
import { onMounted, onUnmounted, readonly, shallowRef, watch } from 'vue'

import { screenAmbientLightDiagnosticsChannelName } from '../../shared/screen-ambient-light-diagnostics'

/** Receives transient capture diagnostics from the main AIRI renderer. */
export function useScreenAmbientLightDiagnostics() {
  const diagnostics = shallowRef<ScreenAmbientLightDiagnosticsSnapshot>()
  const { data, post } = useBroadcastChannel<ScreenAmbientLightDiagnosticsChannelEvent, ScreenAmbientLightDiagnosticsChannelEvent>({
    name: screenAmbientLightDiagnosticsChannelName,
  })

  function requestCurrent() {
    post({ type: 'request-current' })
  }

  function requestWhenVisible() {
    if (document.visibilityState === 'visible')
      requestCurrent()
  }

  onMounted(() => {
    requestCurrent()
    window.addEventListener('focus', requestCurrent)
    document.addEventListener('visibilitychange', requestWhenVisible)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', requestCurrent)
    document.removeEventListener('visibilitychange', requestWhenVisible)
  })

  watch(data, (event) => {
    if (event?.type === 'snapshot')
      diagnostics.value = event.snapshot
  })

  return {
    diagnostics: readonly(diagnostics),
    requestCurrent,
  }
}
