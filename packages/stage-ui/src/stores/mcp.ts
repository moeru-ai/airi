import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useMcpStore = defineStore('mcp', () => {
  const serverCmd = useLocalStorage('settings/mcp/server-cmd', '')
  const serverArgs = useLocalStorage('settings/mcp/server-args', '')
  const connected = useLocalStorage('mcp/connected', false) // use local storage to sync between windows

  return {
    serverCmd,
    serverArgs,
    connected,
  }
})
