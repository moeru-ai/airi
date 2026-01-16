import { refManualReset, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useMcpStore = defineStore('mcp', () => {
  const serverCmd = refManualReset<string>(useLocalStorage<string>('settings/mcp/server-cmd', ''))
  const serverArgs = refManualReset<string>(useLocalStorage<string>('settings/mcp/server-args', ''))
  const connected = refManualReset<boolean>(useLocalStorage<boolean>('mcp/connected', false)) // use local storage to sync between windows

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
