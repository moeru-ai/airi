import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useVersionedLocalStorage } from '../composables/use-versioned-local-storage'
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
  const configs = useVersionedLocalStorage<Record<string, ProviderCatalogProvider>>('app:ui:provider-catalog:configs', {}, { defaultVersion: '1.0.0' })

  function addProvider(definitionId: string, initialConfig: Record<string, any> = {}) {
    if (!getDefinedProvider(definitionId)) {
      throw new Error(`Provider definition with id "${definitionId}" not found.`)
    }

    const providerConfig = {
      id: nanoid(),
      definitionId,
      name: getDefinedProvider(definitionId)!.name,
      config: initialConfig,
      validated: false,
      validationBypassed: false,
    } satisfies ProviderCatalogProvider

    configs.value[providerConfig.id] = providerConfig
  }

  function removeProvider(providerId: string) {
    delete configs.value[providerId]
  }

  function commitProviderConfig(providerId: string, newConfig: Record<string, any>, options: { validated: boolean, validationBypassed: boolean }) {
    if (!configs.value[providerId]) {
      return
    }

    configs.value[providerId].config = { ...newConfig }
    configs.value[providerId].validated = options.validated
    configs.value[providerId].validationBypassed = options.validationBypassed
  }

  return {
    configs,
    defs,

    getDefinedProvider,

    addProvider,
    removeProvider,
    commitProviderConfig,
  }
})
