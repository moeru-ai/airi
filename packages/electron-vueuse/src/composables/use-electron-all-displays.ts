import { defineInvoke } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { useAsyncState, useIntervalFn } from '@vueuse/core'

import { useElectronEventaContext } from './use-electron-eventa-context'

/**
 * Returns the last completed display snapshot, initially empty. Polls every
 * five seconds within the caller's Vue scope. Pending or failed refreshes
 * retain the previous snapshot; a successful empty result replaces it.
 */
export function useElectronAllDisplays() {
  const context = useElectronEventaContext()
  const getAllDisplays = defineInvoke(context.value, electron.screen.getAllDisplays)
  // Keep the last completed snapshot while polling. An empty list during each
  // refresh looks like all monitors disconnected to capture/window consumers.
  const { state: allDisplays, execute } = useAsyncState(() => getAllDisplays(), [], { resetOnExecute: false })

  useIntervalFn(() => {
    void execute()
  }, 5000)

  return allDisplays
}
