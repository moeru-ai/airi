import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAsyncState, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { electronApplyServerChannelConfig, electronGetServerChannelConfig } from '../../../shared/eventa'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const websocketTlsConfig = useLocalStorage<{ cert?: string, key?: string, passphrase?: string } | null | undefined>('settings/server-channel/websocket-tls-config', null)
  const websocketAuthToken = useLocalStorage<string>('settings/server-channel/websocket-auth-token', '')

  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

  const serverChannelConfig = useAsyncState(getServerChannelConfig, null)

  watch(websocketTlsConfig, async (newValue) => {
    await applyServerChannelConfig({ websocketTlsConfig: newValue ? {} : null })
  })

  watch(websocketAuthToken, async (newValue) => {
    await applyServerChannelConfig({ websocketAuthToken: newValue })
  })

  watch(serverChannelConfig.state, (newConfig) => {
    websocketTlsConfig.value = newConfig?.websocketTlsConfig
    websocketAuthToken.value = newConfig?.websocketAuthToken || ''
  })

  return {
    websocketTlsConfig,
    websocketAuthToken,
  }
})
