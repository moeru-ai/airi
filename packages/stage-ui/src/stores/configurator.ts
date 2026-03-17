import { defineStore } from 'pinia'

import { useModsServerChannelStore } from './mods/api/channel-server'

export const useConfiguratorByModsChannelServer = defineStore('configurator:adapter:proj-airi:server-sdk', () => {
  const channelStore = useModsServerChannelStore()
  const { send } = channelStore

  function updateFor(moduleName: string, config: Record<string, unknown>) {
    send({
      type: 'ui:configure' as const,
      data: {
        moduleName,
        config,
      },
    })
  }

  function updateForIfAvailable(moduleName: string, config: Record<string, unknown>) {
    if (!channelStore.hasModule(moduleName)) {
      return false
    }

    updateFor(moduleName, config)
    return true
  }

  return {
    updateFor,
    updateForIfAvailable,
  }
})
