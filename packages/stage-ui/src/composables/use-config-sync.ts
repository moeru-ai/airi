import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useProvidersStore } from '../stores/providers'
import { client } from './api'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncAt: number | null
  lastError: string | null
  pendingChanges: number
}

interface RemoteProviderConfig {
  id: string
  definitionId: string
  name: string
  config: Record<string, unknown>
  validated: boolean
  validationBypassed: boolean
  createdAt: string
  updatedAt: string
}

export const useConfigSyncStore = defineStore('config-sync', () => {
  const authStore = useAuthStore()
  const providersStore = useProvidersStore()

  const status = ref<SyncStatus>('idle')
  const lastSyncAt = useLocalStorage<number | null>('sync/v1/last-sync-at', null)
  const lastError = ref<string | null>(null)
  const pendingChanges = ref(0)

  const canSync = computed(() => authStore.isAuthenticated)

  async function pullProviderConfigs(): Promise<void> {
    if (!canSync.value)
      return

    try {
      const res = await client.api.v1.providers.$get()
      if (!res.ok)
        throw new Error(`Pull failed: ${res.status}`)

      const remoteConfigs: RemoteProviderConfig[] = await res.json()

      for (const remote of remoteConfigs) {
        const localConfig = providersStore.getProviderConfig(remote.definitionId)
        const remoteUpdatedAt = new Date(remote.updatedAt).getTime()

        if (!localConfig || !localConfig._syncedAt || remoteUpdatedAt > localConfig._syncedAt) {
          providersStore.applyRemoteProviderConfig(remote.definitionId, {
            ...remote.config,
            _remoteId: remote.id,
            _syncedAt: remoteUpdatedAt,
          })
        }
      }
    }
    catch (err) {
      throw new Error(`Failed to pull provider configs: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function pushProviderConfigs(): Promise<void> {
    if (!canSync.value)
      return

    const addedProviders = providersStore.addedProviders
    for (const providerId of addedProviders) {
      const config = providersStore.getProviderConfig(providerId)
      if (!config)
        continue

      const remoteId = config._remoteId as string | undefined

      try {
        if (remoteId) {
          await client.api.v1.providers[':id'].$patch({
            param: { id: remoteId },
            json: {
              definitionId: providerId,
              name: providerId,
              config: sanitizeConfigForSync(config),
            },
          })
        }
        else {
          const res = await client.api.v1.providers.$post({
            json: {
              definitionId: providerId,
              name: providerId,
              config: sanitizeConfigForSync(config),
            },
          })
          if (res.ok) {
            const created: RemoteProviderConfig = await res.json()
            providersStore.applyRemoteProviderConfig(providerId, {
              ...config,
              _remoteId: created.id,
              _syncedAt: Date.now(),
            })
          }
        }
      }
      catch (err) {
        console.error(`Failed to push config for ${providerId}:`, err)
      }
    }
  }

  async function sync(): Promise<void> {
    if (!canSync.value)
      return

    status.value = 'syncing'
    lastError.value = null

    try {
      await pullProviderConfigs()
      await pushProviderConfigs()
      lastSyncAt.value = Date.now()
      status.value = 'success'
    }
    catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      status.value = 'error'
    }
  }

  function setupAutoSync() {
    authStore.onAuthenticated(async () => {
      await sync()
    })
  }

  return {
    status,
    lastSyncAt,
    lastError,
    pendingChanges,
    canSync,
    sync,
    pullProviderConfigs,
    pushProviderConfigs,
    setupAutoSync,
  }
})

function sanitizeConfigForSync(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...config }
  delete sanitized._remoteId
  delete sanitized._syncedAt
  return sanitized
}
