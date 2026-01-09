import type { ProviderCatalogProvider } from '../database/repos/providers.repo'

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { useAsyncState } from '../composables/use-async-state'
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

    return useAsyncState(async () => {
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
    }, { immediate: true })
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, any> = {}) {
    if (!getDefinedProvider(definitionId)) {
      throw new Error(`Provider definition with id "${definitionId}" not found.`)
    }

    return useAsyncState(async () => {
      const res = await client.api.providers.$post({
        json: {
          definitionId,
          name: getDefinedProvider(definitionId)!.name,
          config: initialConfig,
          validated: false,
          validationBypassed: false,
        },
      })
      if (!res.ok) {
        throw new Error('Failed to add provider')
      }
      const item = await res.json()

      const provider: ProviderCatalogProvider = {
        id: item.id,
        definitionId: item.definitionId,
        name: item.name,
        config: item.config as Record<string, any>,
        validated: item.validated,
        validationBypassed: item.validationBypassed,
      }
      configs.value[item.id] = provider
      await providersRepo.upsert(provider)
      return item
    }, { immediate: true })
  }

  async function removeProvider(providerId: string) {
    return useAsyncState(async () => {
      const res = await client.api.providers[':id'].$delete({
        param: { id: providerId },
      })
      if (!res.ok) {
        throw new Error('Failed to remove provider')
      }
      delete configs.value[providerId]
      await providersRepo.remove(providerId)
    }, { immediate: true })
  }

  async function commitProviderConfig(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    if (!configs.value[providerId]) {
      return
    }

    return useAsyncState(async () => {
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

      const provider = configs.value[providerId]
      provider.config = { ...item.config as Record<string, any> }
      provider.validated = item.validated
      provider.validationBypassed = item.validationBypassed
      await providersRepo.upsert(provider)
    }, { immediate: true })
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
