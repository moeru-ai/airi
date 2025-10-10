import { defineStore } from 'pinia'

import { useModsChannelServerStore } from './mods/api/channel-server'

export const useConfiguratorByModsChannelServer = defineStore('configurator:adapter:proj-airi:server-sdk', () => {
  const { send } = useModsChannelServerStore()

  function updateFor(moduleName: string, config: Record<string, unknown>) {
    send({
      type: 'ui:configure' as const,
      data: {
        moduleName,
        config,
      },
    })
  }

  return {
    updateFor,
  }
})
