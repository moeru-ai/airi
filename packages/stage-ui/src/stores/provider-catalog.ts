import type { ProviderCatalogProvider } from '../database/repos/providers.repo'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstRequest } from '../composables/use-local-first'
import { providersRepo } from '../database/repos/providers.repo'
import { getDefinedProvider, listProviders } from '../libs/providers/providers'

export const useProviderCatalogStore = defineStore('provider-catalog', () => {
  const defs = computed(() => listProviders())
  const configs = ref<Record<string, ProviderCatalogProvider>>({})

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
          newConfigs[item.id] = {
            id: item.id,
            definitionId: item.definitionId,
            name: item.name,
            config: item.config as Record<string, any>,
            validated: item.validated,
            validationBypassed: item.validationBypassed,
          }
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

    return useLocalFirstRequest<any>({
      local: async () => {
        configs.value[id] = provider
        await providersRepo.upsert(provider)
        return provider
      },
      remote: async () => {
        const res = await client.api.providers.$post({
          json: {
            id,
            definitionId,
            name: provider.name,
            config: provider.config,
            validated: provider.validated,
            validationBypassed: provider.validationBypassed,
          },
        })
        if (!res.ok) {
          throw new Error('Failed to add provider')
        }
        const item = await res.json()
        const finalProvider: ProviderCatalogProvider = {
          id: item.id,
          definitionId: item.definitionId,
          name: item.name,
          config: item.config as Record<string, any>,
          validated: item.validated,
          validationBypassed: item.validationBypassed,
        }

        configs.value[item.id] = finalProvider
        await providersRepo.upsert(finalProvider)
        return item
      },
    })
  }

  async function removeProvider(providerId: string) {
    if (!configs.value[providerId]) {
      return
    }

    return useLocalFirstRequest<void>({
      local: async () => {
        delete configs.value[providerId]
        await providersRepo.remove(providerId)
      },
      remote: async () => {
        const res = await client.api.providers[':id'].$delete({
          param: { id: providerId },
        })
        if (!res.ok) {
          throw new Error('Failed to remove provider')
        }
      },
    })
  }

  async function commitProviderConfig(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    const provider = configs.value[providerId]
    if (!provider) {
      return
    }

    return useLocalFirstRequest<any>({
      local: async () => {
        provider.config = { ...newConfig }
        provider.validated = options.validated
        provider.validationBypassed = options.validationBypassed
        await providersRepo.upsert(provider)
        return provider
      },
      remote: async () => {
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
        const item = await res.json()
        // Sync with server response just in case
        provider.config = { ...item.config as Record<string, any> }
        provider.validated = item.validated
        provider.validationBypassed = item.validationBypassed
        await providersRepo.upsert(provider)
        return item
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
