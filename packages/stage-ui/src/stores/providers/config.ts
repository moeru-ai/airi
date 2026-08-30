import type {} from 'pinia-plugin-synced'

import type { CustomModelConnectionConfig } from '../../libs/providers/custom-model/config'
import type { InferenceServiceProvider, ProviderValidationStatus } from '../../libs/providers/types'

import { useMutation, useQuery } from '@pinia/colada'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { client } from '../../composables/api'
import { getDefinedProvider } from '../../libs/providers'
import {
  CUSTOM_MODEL_DEFINITION_ID,
  CustomModelConfigError,
  resolveCustomModelValidationStatus,
  validateCustomModelConnection,
} from '../../libs/providers/custom-model/config'
import { inferenceServiceProvidersService as service } from '../../services/inference-service-providers'
import { useAuthStore } from '../auth'

const PROVIDERS_QUERY_KEY = ['inference-service-providers']
const providerStorageOptions = {
  // pinia-plugin-synced is the only cross-window propagation channel for this
  // store. Listening to storage events would feed replicated state back into
  // the leader as a new state proposal.
  listenToStorageChanges: false,
} as const

/**
 * Creates the remote provider-list query.
 *
 * The query returns a remote snapshot. The Provider Config Store merges that snapshot
 * into its persisted, cross-window state after the request succeeds.
 */
function createProvidersQueryOptions() {
  return {
    key: PROVIDERS_QUERY_KEY,
    query: async (context: { signal: AbortSignal }) => {
      const remote = await service.fetchRemote(client, { abortSignal: context.signal })
      return remote
    },
    enabled: false,
  }
}

/**
 * Stores serializable provider instances and their configuration.
 *
 * Pinia Colada owns remote request state. This store remains the source of
 * truth for the local, cross-window provider snapshot.
 */
export const useProviderConfigStore = defineStore('provider-config', () => {
  const providers = useLocalStorage<Record<string, InferenceServiceProvider>>('settings/providers/configured', {}, providerStorageOptions)
  const addedProviders = useLocalStorage<Record<string, boolean>>('settings/providers/added', {}, providerStorageOptions)
  const legacyConfigs = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {}, providerStorageOptions)

  // Import the previous provider configuration shape once. Provider ids remain
  // stable, so existing model selections keep pointing at the same provider.
  for (const [providerId, config] of Object.entries(legacyConfigs.value)) {
    if (providers.value[providerId])
      continue

    const definitionId = providerId.startsWith('vision-')
      ? providerId.slice('vision-'.length)
      : providerId
    const definition = getDefinedProvider(definitionId)
    if (!definition)
      continue

    providers.value[providerId] = {
      id: providerId,
      definitionId,
      name: definition.name,
      persistence: definition.configStorage ?? 'remote',
      config,
      status: 'unconfigured',
      configuredBy: definition.configuredBy ?? 'user',
    }
  }

  // Provider definitions own configuration lifecycle policy. Apply that
  // policy to persisted snapshots before module pages consume them. Providers
  // without an owner declaration remain user-configured.
  for (const provider of Object.values(providers.value)) {
    const configuredByDefinition = getDefinedProvider(provider.definitionId)?.configuredBy
    if (configuredByDefinition) {
      provider.configuredBy = configuredByDefinition
    }
    else if (!provider.configuredBy) {
      provider.configuredBy = 'user'
    }
  }

  const providersQuery = useQuery(createProvidersQueryOptions())
  const addProviderMutation = useMutation({
    mutation: async (provider: InferenceServiceProvider) => service.createRemote(client, provider),
  })
  const removeProviderMutation = useMutation({
    mutation: async (providerId: string) => service.deleteRemote(client, providerId),
  })
  const updateProviderMutation = useMutation({
    mutation: async (payload: {
      providerId: string
      config: Record<string, unknown>
      status: ProviderValidationStatus
    }) => service.patchConfigRemote(client, payload.providerId, payload.config, payload.status),
  })

  const configs = computed(() => Object.fromEntries(
    Object.entries(providers.value).map(([providerId, provider]) => [providerId, provider.config]),
  ))
  const listedProviders = computed(() => Object.fromEntries(
    Object.entries(providers.value).filter(([providerId]) => addedProviders.value[providerId]),
  ))
  const configuredProviders = computed(() => Object.fromEntries(
    Object.entries(providers.value).map(([providerId, provider]) => [providerId, provider.status === 'configured']),
  ))
  const mutationError = computed(() =>
    addProviderMutation.error.value
    ?? removeProviderMutation.error.value
    ?? updateProviderMutation.error.value)

  function getProvider(providerId: string) {
    return providers.value[providerId]
  }

  function getProviderConfig(providerId: string) {
    return providers.value[providerId]?.config
  }

  function ensureProvider(providerId: string, definitionId: string, config: Record<string, unknown> = {}) {
    const current = providers.value[providerId]
    if (current)
      return current

    const definition = getDefinedProvider(definitionId)
    if (!definition)
      throw new Error(`Provider definition with id "${definitionId}" not found.`)

    const provider = {
      id: providerId,
      definitionId,
      name: definition.name,
      persistence: definition.configStorage ?? 'remote',
      config,
      status: 'unconfigured' as const,
      configuredBy: definition.configuredBy ?? 'user',
    }
    providers.value[providerId] = provider
    return provider
  }

  function markProviderAdded(providerId: string) {
    addedProviders.value[providerId] = true
  }

  function unmarkProviderAdded(providerId: string) {
    delete addedProviders.value[providerId]
  }

  function setProviderStatus(providerId: string, status: ProviderValidationStatus) {
    const provider = providers.value[providerId]
    if (provider)
      provider.status = status
  }

  function mergeProviderSnapshot(snapshot: Record<string, InferenceServiceProvider>) {
    const next = { ...providers.value }
    for (const [providerId, remoteProvider] of Object.entries(snapshot)) {
      // Local-only connections never cross the remote provider API. A remote
      // id collision must not replace their secrets or persistence boundary.
      if (next[providerId]?.persistence === 'local')
        continue

      next[providerId] = remoteProvider
      markProviderAdded(providerId)
    }
    providers.value = next
  }

  function storedCustomModelConfig(config: CustomModelConnectionConfig): Record<string, unknown> {
    return Object.fromEntries(Object.entries(config))
  }

  function nextInstanceName(definitionId: string, baseName: string) {
    const usedNames = new Set(
      Object.values(providers.value)
        .filter(provider => provider.definitionId === definitionId)
        .map(provider => provider.name),
    )
    if (!usedNames.has(baseName))
      return baseName

    let index = 2
    while (usedNames.has(`${baseName} ${index}`))
      index += 1
    return `${baseName} ${index}`
  }

  function snapshotProviders(): Record<string, InferenceServiceProvider> {
    return JSON.parse(JSON.stringify(providers.value)) as Record<string, InferenceServiceProvider>
  }

  async function fetchProviders() {
    const authStore = useAuthStore()
    if (!authStore.token) {
      // A 401 on the provider API starts a full-page sign-in. Anonymous users
      // still need the local custom-model snapshot without that redirect.
      return snapshotProviders()
    }

    try {
      const state = await providersQuery.refetch(true)
      if (state.data) {
        // The server snapshot has the highest priority for ids that exist remotely.
        mergeProviderSnapshot(state.data)
      }
      return snapshotProviders()
    }
    catch {
      // The merged local snapshot is authoritative while the remote endpoint is unavailable.
      return snapshotProviders()
    }
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, unknown> = {}, options: { name?: string } = {}) {
    const provider = service.buildLocal(definitionId, initialConfig)

    if (provider.definitionId === CUSTOM_MODEL_DEFINITION_ID) {
      const name = options.name?.trim()
      provider.name = name || nextInstanceName(provider.definitionId, provider.name)

      if (Object.keys(initialConfig).length > 0) {
        const result = validateCustomModelConnection(initialConfig)
        if (!result.success)
          throw new CustomModelConfigError(result.code, result.field)
        provider.config = storedCustomModelConfig(result.output)
      }
    }

    providers.value[provider.id] = provider
    markProviderAdded(provider.id)

    if (provider.persistence === 'local')
      return provider

    try {
      const remote = await addProviderMutation.mutateAsync(provider)
      delete providers.value[provider.id]
      unmarkProviderAdded(provider.id)
      providers.value[remote.id] = remote
      markProviderAdded(remote.id)
      return remote
    }
    catch {
      // A failed remote create does not discard the local provider.
      return provider
    }
  }

  async function removeProvider(providerId: string) {
    if (!providers.value[providerId])
      return

    const provider = providers.value[providerId]
    delete providers.value[providerId]
    unmarkProviderAdded(providerId)

    if (provider.persistence === 'local')
      return

    try {
      await removeProviderMutation.mutateAsync(providerId)
    }
    catch {
      // A failed remote delete does not restore a provider that the user removed locally.
    }
  }

  async function updateProviderName(providerId: string, name: string) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    const nextName = name.trim()
    if (!nextName)
      throw new Error('Provider name is required.')

    const localProvider = {
      ...provider,
      name: nextName,
    }
    providers.value[providerId] = localProvider
    return localProvider
  }

  async function updateProviderConfig(
    providerId: string,
    config: Record<string, unknown>,
    status: ProviderValidationStatus,
    options: { validationResult?: boolean } = {},
  ) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    let nextConfig = { ...config }
    let nextStatus = status

    if (provider.definitionId === CUSTOM_MODEL_DEFINITION_ID) {
      const result = validateCustomModelConnection(config)
      if (!result.success)
        throw new CustomModelConfigError(result.code, result.field)

      nextConfig = storedCustomModelConfig(result.output)
      nextStatus = resolveCustomModelValidationStatus(
        provider.config,
        result.output,
        status,
        options,
      )
    }

    const localProvider = {
      ...provider,
      config: nextConfig,
      status: nextStatus,
    }
    providers.value[providerId] = localProvider

    if (localProvider.persistence === 'local')
      return localProvider

    try {
      const remote = await updateProviderMutation.mutateAsync({ providerId, config, status })
      providers.value[remote.id] = remote
      return remote
    }
    catch {
      // A failed remote update keeps the local provider configuration.
      return localProvider
    }
  }

  async function resetProviders() {
    providers.value = {}
    addedProviders.value = {}
  }

  return {
    providers,
    configs,
    addedProviders,
    listedProviders,
    configuredProviders,
    isLoading: computed(() => providersQuery.isLoading.value),
    error: computed(() => providersQuery.error.value),
    mutationError,

    getProvider,
    getProviderConfig,
    ensureProvider,
    markProviderAdded,
    unmarkProviderAdded,
    setProviderStatus,
    fetchProviders,
    addProvider,
    removeProvider,
    updateProviderName,
    updateProviderConfig,
    resetProviders,
  }
}, {
  synced: {
    actions: [
      'fetchProviders',
      'ensureProvider',
      'markProviderAdded',
      'unmarkProviderAdded',
      'setProviderStatus',
      'addProvider',
      'removeProvider',
      'updateProviderName',
      'updateProviderConfig',
      'resetProviders',
    ],
    state: true,
  },
})
