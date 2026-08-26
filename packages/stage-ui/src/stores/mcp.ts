import { defineStore } from 'pinia'

import { useLocalStorageManualReset } from '../../../stage-shared/src/composables/use-local-storage-manual-reset'

export const useMcpStore = defineStore('mcp', () => {
  const serverCmd = useLocalStorageManualReset<string>('settings/mcp/server-cmd', '')
  const serverArgs = useLocalStorageManualReset<string>('settings/mcp/server-args', '')
  const connected = useLocalStorageManualReset<boolean>('mcp/connected', false) // use local storage to sync between windows

  function resetState() {
    serverCmd.reset()
    serverArgs.reset()
    connected.reset()
  }

  return {
    serverCmd,
    serverArgs,
    connected,
    resetState,
  }
})
