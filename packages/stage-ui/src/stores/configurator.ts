import { isSteamDistribution } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'

import { useModsServerChannelStore } from './mods/api/channel-server'

export const useConfiguratorByModsChannelServer = defineStore('configurator:adapter:proj-airi:server-sdk', () => {
  const { send } = useModsServerChannelStore()

  function updateFor(moduleName: string, config: Record<string, unknown>) {
    if (isSteamDistribution() && (moduleName === 'discord' || moduleName === 'twitter'))
      return

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
