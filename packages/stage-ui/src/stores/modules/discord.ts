import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useConfiguratorByModsChannelServer } from '../configurator'
import { useModsServerChannelStore } from '../mods/api/channel-server'

export const useDiscordStore = defineStore('discord', () => {
  const configurator = useConfiguratorByModsChannelServer()
  const enabled = useLocalStorageManualReset<boolean>('settings/discord/enabled', false)
  const token = useLocalStorageManualReset<string>('settings/discord/token', '')
  const connected = ref(false)
  const modsChannel = useModsServerChannelStore()

  modsChannel.onEvent('module:status', (event) => {
    if (event.data.identity.plugin.id !== 'discord') {
      return
    }

    connected.value = event.data.phase === 'ready'
  })

  function saveSettings() {
    connected.value = false
    // Data is automatically saved to localStorage via useLocalStorage
    // Also broadcast configuration to backend
    configurator.updateFor('discord', {
      token: token.value,
      enabled: enabled.value,
    })
  }

  function resetState() {
    enabled.reset()
    token.reset()
    connected.value = false
    saveSettings()
  }

  return {
    enabled,
    token,
    connected,
    saveSettings,
    resetState,
  }
})
