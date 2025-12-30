import type { AutoUpdaterState } from '../../../../shared/eventa'

import { computed, onMounted, ref } from 'vue'

import {
  autoUpdater,
  electronAutoUpdaterStateChanged,
} from '../../../../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '../use-electron-eventa-context'

export function useElectronAutoUpdater() {
  const context = useElectronEventaContext()

  const state = ref<AutoUpdaterState>({ status: 'idle' })

  const getState = useElectronEventaInvoke(autoUpdater.getState, context.value)
  const checkForUpdates = useElectronEventaInvoke(autoUpdater.checkForUpdates, context.value)
  const downloadUpdate = useElectronEventaInvoke(autoUpdater.downloadUpdate, context.value)
  const quitAndInstall = useElectronEventaInvoke(autoUpdater.quitAndInstall, context.value)

  const isBusy = computed(() => ['checking', 'downloading'].includes(state.value.status))
  const canDownload = computed(() => state.value.status === 'available')
  const canRestartToUpdate = computed(() => state.value.status === 'downloaded')

  onMounted(async () => {
    try {
      const current = await getState()
      if (current)
        state.value = current
    }
    catch {}

    try {
      context.value.on(electronAutoUpdaterStateChanged, (evt) => {
        if (evt.body)
          state.value = evt.body
      })
    }

    catch {}
  })

  return {
    state,
    isBusy,
    canDownload,
    canRestartToUpdate,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
  }
}
