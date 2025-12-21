import { defineStore } from 'pinia'

import { createResettableLocalStorage } from '../utils/resettable'

export const useMcpStore = defineStore('mcp', () => {
  const [serverCmd, resetServerCmd] = createResettableLocalStorage('settings/mcp/server-cmd', '')
  const [serverArgs, resetServerArgs] = createResettableLocalStorage('settings/mcp/server-args', '')
  const [connected, resetConnected] = createResettableLocalStorage('mcp/connected', false) // use local storage to sync between windows

  function resetState() {
    resetServerCmd()
    resetServerArgs()
    resetConnected()
  }

  return {
    serverCmd,
    serverArgs,
    connected,
    resetState,
  }
})
