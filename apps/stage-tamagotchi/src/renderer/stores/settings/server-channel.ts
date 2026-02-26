import type { ElectronServerChannelTlsConfig } from '../../../shared/eventa'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useServerChannelSettingsStore = defineStore('tamagotchi-server-channel-settings', () => {
  const websocketTlsConfig = useLocalStorage<ElectronServerChannelTlsConfig | null>('settings/server-channel/websocket-tls-config', null)

  return {
    websocketTlsConfig,
  }
})
