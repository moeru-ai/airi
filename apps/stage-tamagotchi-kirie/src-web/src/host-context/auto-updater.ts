import { computed, shallowRef } from 'vue'

export interface HostAutoUpdaterState {
  status: 'disabled'
}

/**
 * Reports the updater as disabled until Kirie implements its distribution path.
 */
export function useHostAutoUpdater() {
  const state = shallowRef<HostAutoUpdaterState>({ status: 'disabled' })
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
