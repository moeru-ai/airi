import { ipcRenderer } from 'electron'

import { exposeWithCustomAPI } from './shared'

exposeWithCustomAPI({
  singing: {
    getLocalServerInfo: () => ipcRenderer.invoke('airi:singing:get-local-server-info') as Promise<{
      url: string | null
      port: number | null
      ready: boolean
      error?: string
    }>,
  },
})
