import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { useModsServerChannelStore } from './channel-server'

/** One connected module from the server's module list. */
interface DirectoryModule {
  name: string
  /** The module identity id from the server's list. */
  identityId?: string
}

/**
 * Connected modules, from the server's module list.
 *
 * Use when:
 * - Automations name a module by its registered name, which stays the same across restarts.
 *
 * Expects:
 * - Each renderer calls {@link listen} once while its server channel runs.
 *
 * Returns:
 * - Modules from the latest server list.
 */
export const useModuleDirectoryStore = defineStore('mods:api:module-directory', () => {
  const serverChannel = useModsServerChannelStore()
  const modules = shallowRef<DirectoryModule[]>([])

  /** The registered name of the module with this identity. Names stay the same across restarts, unlike instance ids. */
  function nameOf(identityId: string | undefined) {
    return identityId ? modules.value.find(module => module.identityId === identityId)?.name : undefined
  }

  function listen() {
    return serverChannel.onEvent('registry:modules:sync', (event) => {
      modules.value = event.data.modules.map(module => ({
        name: module.name,
        identityId: module.identity?.id,
      }))
    })
  }

  return {
    modules,
    nameOf,
    listen,
  }
})
