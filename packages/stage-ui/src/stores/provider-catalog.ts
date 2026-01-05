import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { getDefinedProvider, listProviders } from '../libs/providers/providers'

interface ProviderCatalogProvider {
  id: string
  definitionId: string
  name: string
  config: Record<string, any>
  validated: boolean
  validationBypassed: boolean
}

export const useProviderCatalogStore = defineStore('provider-catalog', () => {
  const defs = computed(() => listProviders())
  const configs = ref<Record<string, ProviderCatalogProvider>>({})
  const isLoading = ref(false)
  const error = ref<unknown>(null)

  async function fetchList() {
    isLoading.value = true
    error.value = null
    try {
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
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, any> = {}) {
    if (!getDefinedProvider(definitionId)) {
      throw new Error(`Provider definition with id "${definitionId}" not found.`)
    }

    isLoading.value = true
    error.value = null
    try {
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

      configs.value[item.id] = {
        id: item.id,
        definitionId: item.definitionId,
        name: item.name,
        config: item.config as Record<string, any>,
        validated: item.validated,
        validationBypassed: item.validationBypassed,
      }
      return item
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function removeProvider(providerId: string) {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.providers[':id'].$delete({
        param: { id: providerId },
      })
      if (!res.ok) {
        throw new Error('Failed to remove provider')
      }
      delete configs.value[providerId]
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function commitProviderConfig(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    if (!configs.value[providerId]) {
      return
    }

    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.providers[':id'].$patch({
        param: { id: providerId },
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

      configs.value[providerId].config = { ...item.config as Record<string, any> }
      configs.value[providerId].validated = item.validated
      configs.value[providerId].validationBypassed = item.validationBypassed
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    configs,
    defs,
    isLoading,
    error,

    getDefinedProvider,

    fetchList,
    addProvider,
    removeProvider,
    commitProviderConfig,
  }
})
