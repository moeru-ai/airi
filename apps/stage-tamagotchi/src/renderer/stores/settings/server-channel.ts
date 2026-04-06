import type { ElectronServerChannelConfig } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,

} from '../../../shared/eventa'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const tlsConfig = useLocalStorage<{ cert?: string, key?: string, passphrase?: string } | null | undefined>('settings/server-channel/websocket-tls-config', null)
  const hostname = useLocalStorage<string>('settings/server-channel/hostname', '127.0.0.1')
  const authToken = useLocalStorage<string>('settings/server-channel/auth-token', '')
  const lastApplyError = ref<string | null>(null)
  const syncingWithServer = ref(false)

  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

  function syncConfigFromServer(config: ElectronServerChannelConfig) {
    syncingWithServer.value = true
    tlsConfig.value = config.tlsConfig ?? null
    if (config.hostname !== undefined) {
      hostname.value = config.hostname
    }
    if (config.authToken !== undefined) {
      authToken.value = config.authToken
    }
    syncingWithServer.value = false
  }

  async function refreshServerChannelConfig() {
    const config = await getServerChannelConfig()
    syncConfigFromServer(config)
    return config
  }

  watch([tlsConfig, hostname, authToken], async ([newTls, newHost, newAuth], [oldTls, oldHost, oldAuth]) => {
    if (syncingWithServer.value || (JSON.stringify(newTls) === JSON.stringify(oldTls) && newHost === oldHost && newAuth === oldAuth)) {
      return
    }

    lastApplyError.value = null

    try {
      const config = await applyServerChannelConfig({
        tlsConfig: newTls ? {} : null,
        hostname: newHost,
        authToken: newAuth,
      })
      syncConfigFromServer(config)
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to apply WebSocket security setting'
      lastApplyError.value = message
      toast.error(message)
    }
  })

  void refreshServerChannelConfig()

  return {
    lastApplyError,
    refreshServerChannelConfig,
    tlsConfig,
    hostname,
    authToken,
  }
})
