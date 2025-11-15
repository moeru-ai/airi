import { defineInvoke } from '@moeru/eventa'
import { useAsyncState, useIntervalFn } from '@vueuse/core'

import { electron } from '../../../../shared/electron'
import { useElectronEventaContext } from '../use-electron-eventa-context'

export function useElectronAllDisplays() {
  const context = useElectronEventaContext()
  const getAllDisplays = defineInvoke(context.value, electron.screen.getAllDisplays)
  const { state: allDisplays, execute } = useAsyncState(() => getAllDisplays(), [])

  useIntervalFn(() => {
    execute()
  }, 5000)

  return allDisplays
}
