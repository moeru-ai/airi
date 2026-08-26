import type { ElectronServerChannelConfig } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,

} from '../../../shared/eventa'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const tlsConfig = useLocalStorage<null | undefined | { cert?: string, key?: string, passphrase?: string }>('settings/server-channel/websocket-tls-config', null)
  const hostname = useLocalStorage<string>('settings/server-channel/hostname', '127.0.0.1')
  const authToken = useLocalStorage<string>('settings/server-channel/auth-token', '')
  const lastApplyError = shallowRef<null | string>(null)
  const syncingWithServer = shallowRef(false)
  const appliedConfig = shallowRef<ElectronServerChannelConfig>()

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
    // This snapshot changes only after the main process accepts the config.
    // Consumers that read runtime state must not react to the optimistic fields above.
    appliedConfig.value = config
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
        authToken: newAuth,
        hostname: newHost,
        tlsConfig: newTls ? {} : null,
      })
      syncConfigFromServer(config)
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to apply WebSocket security setting'
      lastApplyError.value = message

      syncingWithServer.value = true
      tlsConfig.value = oldTls
      hostname.value = oldHost
      authToken.value = oldAuth
      syncingWithServer.value = false

      toast.error(message)
    }
  })

  void refreshServerChannelConfig()

  return {
    appliedConfig,
    authToken,
    hostname,
    lastApplyError,
    refreshServerChannelConfig,
    tlsConfig,
  }
})
