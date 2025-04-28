import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMcpStore = defineStore('mcp', () => {
  const serverCmd = useLocalStorage('settings/mcp/server-cmd', '')
  const serverArgs = useLocalStorage('settings/mcp/server-args', '')
  const connected = ref(false)

  return {
    serverCmd,
    serverArgs,
    connected,
  }
})
