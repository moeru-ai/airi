import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { electronApplyServerChannelConfig, electronGetServerChannelConfig } from '../../../shared/eventa'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const websocketTlsConfig = useLocalStorage<{ cert?: string, key?: string, passphrase?: string } | null | undefined>('settings/server-channel/websocket-tls-config', null)
  const lastApplyError = ref<string | null>(null)
  const syncingWithServer = ref(false)

  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

  function syncTlsConfigFromServer(value: { cert?: string, key?: string, passphrase?: string } | null | undefined) {
    syncingWithServer.value = true
    websocketTlsConfig.value = value ?? null
    syncingWithServer.value = false
  }

  async function refreshServerChannelConfig() {
    const config = await getServerChannelConfig()
    syncTlsConfigFromServer(config.tlsConfig)
    return config
  }

  watch(websocketTlsConfig, async (newValue, oldValue) => {
    if (syncingWithServer.value || (newValue != null) === (oldValue != null)) {
      return
    }

    lastApplyError.value = null

    try {
      const config = await applyServerChannelConfig({ tlsConfig: newValue ? {} : null })
      syncTlsConfigFromServer(config.tlsConfig)
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to apply WebSocket security setting'
      lastApplyError.value = message
      syncTlsConfigFromServer(oldValue)
      toast.error(message)
    }
  })

  void refreshServerChannelConfig()

  return {
    lastApplyError,
    refreshServerChannelConfig,
    websocketTlsConfig,
  }
})
