import type { ProviderCatalogProvider } from '../database/repos/providers.repo'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstMutation, useLocalFirstRequest } from '../composables/use-local-first'
import { registerOutboxHandler, useOutboxQueue } from '../composables/use-outbox-queue'
import { providersRepo } from '../database/repos/providers.repo'
import { getDefinedProvider, listProviders } from '../libs/providers/providers'

export const useProviderCatalogStore = defineStore('provider-catalog', () => {
  const defs = computed(() => listProviders())
  const configs = ref<Record<string, ProviderCatalogProvider>>({})
  useOutboxQueue()

  function toProviderConfig(item: any): ProviderCatalogProvider {
    return {
      id: item.id,
      definitionId: item.definitionId,
      name: item.name,
      config: item.config as Record<string, any>,
      validated: item.validated,
      validationBypassed: item.validationBypassed,
    }
  }

  async function syncProviderFromServer(item: any) {
    const finalProvider = toProviderConfig(item)
    configs.value[item.id] = finalProvider
    await providersRepo.upsert(finalProvider)
    return finalProvider
  }

  async function addProviderRemote(provider: ProviderCatalogProvider) {
    const res = await client.api.providers.$post({
      json: {
        id: provider.id,
        definitionId: provider.definitionId,
        name: provider.name,
        config: provider.config,
        validated: provider.validated,
        validationBypassed: provider.validationBypassed,
      },
    })
    if (!res.ok) {
      throw new Error('Failed to add provider')
    }
    return await res.json()
  }

  async function removeProviderRemote(providerId: string) {
    const res = await client.api.providers[':id'].$delete({
      param: { id: providerId },
    })
    if (!res.ok) {
      throw new Error('Failed to remove provider')
    }
  }

  async function updateProviderRemote(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    const res = await client.api.providers[':id'].$patch({
      param: { id: providerId },
      // @ts-expect-error hono client typing misses json option for this route
      json: {
        config: newConfig,
        validated: options.validated,
        validationBypassed: options.validationBypassed,
      },
    })
    if (!res.ok) {
      throw new Error('Failed to update provider config')
    }
    return await res.json()
  }

  registerOutboxHandler<ProviderCatalogProvider>('providers.add', async (provider) => {
    const item = await addProviderRemote(provider)
    await syncProviderFromServer(item)
  })
  registerOutboxHandler<{ id: string }>('providers.remove', async (payload) => {
    await removeProviderRemote(payload.id)
  })
  registerOutboxHandler<{ id: string, config: Record<string, any>, validated: boolean, validationBypassed: boolean }>('providers.update', async (payload) => {
    const item = await updateProviderRemote(payload.id, payload.config, {
      validated: payload.validated,
      validationBypassed: payload.validationBypassed,
    })
    await syncProviderFromServer(item)
  })

  async function fetchList() {
    // Load from storage immediately
    const cached = await providersRepo.getAll()
    if (Object.keys(cached).length > 0) {
      configs.value = cached
    }

    return useLocalFirstRequest({
      local: async () => undefined,
      remote: async () => {
        const res = await client.api.providers.$get()
        if (!res.ok) {
          throw new Error('Failed to fetch providers')
        }
        const data = await res.json()

        const newConfigs: Record<string, ProviderCatalogProvider> = {}
        for (const item of data) {
          newConfigs[item.id] = toProviderConfig(item)
        }
        configs.value = newConfigs
        await providersRepo.saveAll(newConfigs)
      },
    })
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, any> = {}) {
    const definition = getDefinedProvider(definitionId)
    if (!definition) {
      throw new Error(`Provider definition with id "${definitionId}" not found.`)
    }

    const id = nanoid()
    const provider: ProviderCatalogProvider = {
      id,
      definitionId,
      name: definition.name,
      config: initialConfig,
      validated: false,
      validationBypassed: false,
    }

    return useLocalFirstMutation<any, any>({
      apply: async () => {
        configs.value[id] = provider
        await providersRepo.upsert(provider)
        return async () => {
          delete configs.value[id]
          await providersRepo.remove(id)
        }
      },
      action: async () => {
        return await addProviderRemote(provider)
      },
      onSuccess: async (item: any) => {
        await syncProviderFromServer(item)
        return item
      },
      outbox: {
        type: 'providers.add',
        payload: provider,
      },
    })
  }

  async function removeProvider(providerId: string) {
    const original = configs.value[providerId]
    if (!original) {
      return
    }

    return useLocalFirstMutation<void, void>({
      apply: async () => {
        delete configs.value[providerId]
        await providersRepo.remove(providerId)
        return async () => {
          configs.value[providerId] = original
          await providersRepo.upsert(original)
        }
      },
      action: async () => {
        await removeProviderRemote(providerId)
      },
      outbox: {
        type: 'providers.remove',
        payload: { id: providerId },
      },
    })
  }

  async function commitProviderConfig(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    const provider = configs.value[providerId]
    if (!provider) {
      return
    }

    const originalConfig = { ...provider.config }
    const originalValidated = provider.validated
    const originalValidationBypassed = provider.validationBypassed

    return useLocalFirstMutation<any, void>({
      apply: async () => {
        provider.config = { ...newConfig }
        provider.validated = options.validated
        provider.validationBypassed = options.validationBypassed
        await providersRepo.upsert(provider)
        return async () => {
          provider.config = originalConfig
          provider.validated = originalValidated
          provider.validationBypassed = originalValidationBypassed
          await providersRepo.upsert(provider)
        }
      },
      action: async () => {
        return await updateProviderRemote(providerId, newConfig, options)
      },
      onSuccess: async (item: any) => {
        // Sync with server response just in case
        await syncProviderFromServer(item)
      },
      outbox: {
        type: 'providers.update',
        payload: {
          id: providerId,
          config: { ...newConfig },
          validated: options.validated,
          validationBypassed: options.validationBypassed,
        },
      },
    })
  }

  return {
    configs,
    defs,
    getDefinedProvider,

    fetchList,
    addProvider,
    removeProvider,
    commitProviderConfig,
  }
})
