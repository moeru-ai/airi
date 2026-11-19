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
  const tlsConfig = useLocalStorage<{ cert?: string, key?: string, passphrase?: string } | null | undefined>('settings/server-channel/websocket-tls-config', null)
  const hostname = useLocalStorage<string>('settings/server-channel/hostname', '127.0.0.1')
  const authToken = useLocalStorage<string>('settings/server-channel/auth-token', '')
  const lastApplyError = shallowRef<string | null>(null)
  const appliedConfig = shallowRef<ElectronServerChannelConfig>()

  const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
  const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

  function syncConfigFromServer(config: ElectronServerChannelConfig) {
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
  }

  // The watcher callback runs after the synchronous writes in `syncConfigFromServer` and in the rollback.
  // A flag that these writes set and reset is already cleared when the callback runs.
  // Compare with the accepted config instead, so that these writes do not start another apply.
  function matchesAppliedConfig(nextTls: typeof tlsConfig.value, nextHost: string, nextAuth: string) {
    const applied = appliedConfig.value
    return applied !== undefined
      && Boolean(nextTls) === Boolean(applied.tlsConfig)
      && nextHost === applied.hostname
      && nextAuth === applied.authToken
  }

  async function refreshServerChannelConfig() {
    const config = await getServerChannelConfig()
    syncConfigFromServer(config)
    return config
  }

  watch([tlsConfig, hostname, authToken], async ([newTls, newHost, newAuth], [oldTls, oldHost, oldAuth]) => {
    if (matchesAppliedConfig(newTls, newHost, newAuth) || (JSON.stringify(newTls) === JSON.stringify(oldTls) && newHost === oldHost && newAuth === oldAuth)) {
      return
    }

    lastApplyError.value = null

    try {
      const config = await applyServerChannelConfig({
        tlsConfig: newTls ? {} : null,
        hostname: newHost,
        authToken: newAuth,
      })
      syncConfigFromServer(config)
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'Failed to apply WebSocket security setting'
      lastApplyError.value = message

      const rollback = appliedConfig.value
      tlsConfig.value = rollback ? rollback.tlsConfig ?? null : oldTls
      hostname.value = rollback?.hostname ?? oldHost
      authToken.value = rollback?.authToken ?? oldAuth

      // One id keeps one toast for this setting. A new failure replaces the earlier toast.
      toast.error(message, { id: 'server-channel-apply-error' })
    }
  })

  void refreshServerChannelConfig()

  return {
    lastApplyError,
    appliedConfig,
    refreshServerChannelConfig,
    tlsConfig,
    hostname,
    authToken,
  }
})
