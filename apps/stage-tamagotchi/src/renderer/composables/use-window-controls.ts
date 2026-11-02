import type { ElectronWindowControlsState } from '../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { createSharedComposable } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef } from 'vue'

import {
  electronGetWindowControlsState,
  electronWindowClose,
  electronWindowControlsStateChanged,
  electronWindowMinimize,
  electronWindowToggleMaximize,
} from '../../shared/eventa'

/**
 * Reads and drives this window's buttons for the self-drawn title bar.
 *
 * The main process owns the state. `state` stays undefined until the first answer arrives,
 * so nothing draws a button that the window does not have. Later changes arrive as events.
 * One renderer serves one window, so all callers share one listener.
 */
export const useWindowControls = createSharedComposable(() => {
  const context = useElectronEventaContext()
  const state = shallowRef<ElectronWindowControlsState>()

  const stopStateChanged = context.value.on(electronWindowControlsStateChanged, (event) => {
    if (event?.body)
      state.value = event.body
  })
  onScopeDispose(() => stopStateChanged())

  useElectronEventaInvoke(electronGetWindowControlsState)()
    .then((snapshot) => {
      state.value = snapshot
    })
    .catch((error) => {
      console.warn('[WindowControls] Failed to read the window controls state:', errorMessageFrom(error))
    })

  return {
    state,
    /** The macOS traffic lights sit over the page, except in fullscreen where the system hides them. */
    reservesSystemControls: computed(() => state.value?.systemControls === true && !state.value.fullscreen),
    minimize: useElectronEventaInvoke(electronWindowMinimize),
    toggleMaximize: useElectronEventaInvoke(electronWindowToggleMaximize),
    close: useElectronEventaInvoke(electronWindowClose),
  }
})
