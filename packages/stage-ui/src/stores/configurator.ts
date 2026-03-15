import { defineStore } from 'pinia'

import { useModsServerChannelStore } from './mods/api/channel-server'

export const useConfiguratorByModsChannelServer = defineStore('configurator:adapter:proj-airi:server-sdk', () => {
  const { send } = useModsServerChannelStore()

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
