import type { Ref } from 'vue'

import type { InferenceServiceProvider } from '../models/inference-service-providers'
import type { PatchConfigParams } from '../services/inference-service-providers'

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { inferenceServiceProvidersModel as model } from '../models/inference-service-providers'
import { inferenceServiceProvidersService as service } from '../services/inference-service-providers'

interface StoreQuery<TData> {
  error: Ref<Error | null>
  isLoading: Ref<boolean>
  refetch: (force?: boolean) => Promise<{ data?: TData }>
}

interface StoreMutation<TVars, TData> {
  error: Ref<Error | null>
  mutateAsync: (vars: TVars) => Promise<TData>
}

export function createProviderCatalogListQueryOptions(params: {
  client: Parameters<typeof service.fetchRemote>[0]
  model: Pick<typeof model, 'saveAll'>
  service: Pick<typeof service, 'fetchRemote'>
}) {
  return {
    key: ['inference-service-providers'],
    query: async (context: { signal: AbortSignal }) => {
      const remote = await params.service.fetchRemote(params.client, { abortSignal: context.signal })
      await params.model.saveAll(remote, { abortSignal: context.signal })
      return remote
    },
    enabled: false,
  }
}

export function createProviderCatalogStoreController(params: {
  addProviderMutation: StoreMutation<InferenceServiceProvider, InferenceServiceProvider>
  commitProviderConfigMutation: StoreMutation<{ providerId: string, config: Record<string, unknown>, options: PatchConfigParams }, InferenceServiceProvider>
  configs: Ref<Record<string, InferenceServiceProvider>>
  model: typeof model
  providersQuery: StoreQuery<Record<string, InferenceServiceProvider>>
  removeProviderMutation: StoreMutation<string, void>
  service: typeof service
}) {
  const {
    addProviderMutation,
    commitProviderConfigMutation,
    configs,
    model,
    providersQuery,
    removeProviderMutation,
    service,
  } = params
  const defs = computed(() => service.listDefinitions())
  const mutationError = computed(() =>
    addProviderMutation.error.value
    ?? removeProviderMutation.error.value
    ?? commitProviderConfigMutation.error.value)

  async function fetchList() {
    const cached = await model.list()
    if (Object.keys(cached).length > 0)
      configs.value = cached

    try {
      const state = await providersQuery.refetch(true)
      if (state.data)
        configs.value = state.data
      return state.data ?? cached
    }
    catch {
      return cached
    }
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, unknown> = {}) {
    const provider = service.buildLocal(definitionId, initialConfig)
    configs.value[provider.id] = provider
    await model.upsert(provider)

    try {
      const remote = await addProviderMutation.mutateAsync(provider)
      delete configs.value[provider.id]
      await model.remove(provider.id)
      configs.value[remote.id] = remote
      await model.upsert(remote)
      return remote
    }
    catch {
      return provider
    }
  }

  async function removeProvider(providerId: string) {
    if (!configs.value[providerId])
      return

    delete configs.value[providerId]
    await model.remove(providerId)

    try {
      await removeProviderMutation.mutateAsync(providerId)
    }
    catch {
      // Keep current local-first behavior: local removal is retained on remote failure.
    }
  }

  async function commitProviderConfig(providerId: string, newConfig: Record<string, unknown>, options: PatchConfigParams) {
    const provider = configs.value[providerId]
    if (!provider)
      return

    const localProvider = {
      ...provider,
      config: { ...newConfig },
      validated: options.validated,
      validationBypassed: options.validationBypassed,
    }
    configs.value[providerId] = localProvider
    await model.upsert(localProvider)

    try {
      const remote = await commitProviderConfigMutation.mutateAsync({ providerId, config: newConfig, options })
      configs.value[remote.id] = remote
      await model.upsert(remote)
      return remote
    }
    catch {
      return localProvider
    }
  }

  return {
    configs,
    defs,
    getDefinedProvider: service.getDefinition,
    isLoading: computed(() => providersQuery.isLoading.value),
    error: computed(() => providersQuery.error.value),
    mutationError,

    fetchList,
    addProvider,
    removeProvider,
    commitProviderConfig,
  }
}

export const useProviderCatalogStore = defineStore('provider-catalog', () => {
  const queryCache = useQueryCache()
  const configs = ref<Record<string, InferenceServiceProvider>>({})

  const providersQuery = useQuery(createProviderCatalogListQueryOptions({
    client,
    model,
    service,
  }))

  const addProviderMutation = useMutation({
    mutation: async (provider: InferenceServiceProvider) => service.createRemote(client, provider),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['inference-service-providers'] })
    },
  })

  const removeProviderMutation = useMutation({
    mutation: async (providerId: string) => service.deleteRemote(client, providerId),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['inference-service-providers'] })
    },
  })

  const commitProviderConfigMutation = useMutation({
    mutation: async (payload: {
      providerId: string
      config: Record<string, unknown>
      options: PatchConfigParams
    }) => service.patchConfigRemote(client, payload.providerId, payload.config, payload.options),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['inference-service-providers'] })
    },
  })

  return createProviderCatalogStoreController({
    addProviderMutation,
    commitProviderConfigMutation,
    configs,
    model,
    providersQuery,
    removeProviderMutation,
    service,
  })
})
