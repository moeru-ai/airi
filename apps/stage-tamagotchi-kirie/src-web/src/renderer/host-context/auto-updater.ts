import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'

import { computed, shallowRef } from 'vue'

/**
 * Reports the updater as disabled until Kirie implements its distribution path.
 */
export function useHostAutoUpdater() {
  const state = shallowRef<AutoUpdaterState>({ status: 'disabled' })
  const isBusy = computed(() => false)
  const canDownload = computed(() => false)
  const canRestartToUpdate = computed(() => false)

  return {
    state,
    isBusy,
    canDownload,
    canRestartToUpdate,
    isSupported: false,
    checkForUpdates: async () => state.value,
    downloadUpdate: async () => state.value,
    quitAndInstall: async () => {},
  }
}
