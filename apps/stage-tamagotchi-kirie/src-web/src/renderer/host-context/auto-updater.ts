import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'

import { useElectronAutoUpdater } from '@proj-airi/electron-vueuse'
import { computed, shallowRef } from 'vue'

import { initializeHostContext } from './owner'

/**
 * Exposes the desktop updater without requiring Electron preload APIs in Kirie.
 * Kirie reports the updater as disabled because its distribution path does not
 * yet implement the Electron updater contract.
 */
export function useHostAutoUpdater() {
  if (initializeHostContext().runtime === 'electron') {
    return {
      ...useElectronAutoUpdater(),
      isSupported: true,
    }
  }

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
