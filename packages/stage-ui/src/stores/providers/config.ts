import type {} from 'pinia-plugin-synced'

import type { InferenceServiceProvider, ProviderValidationStatus } from '../../libs/providers/types'

import { useMutation, useQuery } from '@pinia/colada'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../../composables/api'
import { getDefinedProvider } from '../../libs/providers'
import { inferenceServiceProvidersService as service } from '../../services/inference-service-providers'

const PROVIDERS_QUERY_KEY = ['inference-service-providers']
const providerStorageOptions = {
  // pinia-plugin-synced is the only cross-window propagation channel for this
  // store. Listening to storage events would feed replicated state back into
  // the leader as a new state proposal.
  listenToStorageChanges: false,
} as const

interface ProviderValidationLease {
  token: string
  previousStatus: ProviderValidationStatus
}

interface PendingProviderCreationState {
  provider: InferenceServiceProvider
  validationLease?: ProviderValidationLease
}

function createProviderMutationKey(
  provider: InferenceServiceProvider,
  stableStatus: ProviderValidationStatus = provider.status,
) {
  return JSON.stringify({ config: provider.config, status: stableStatus })
}

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
  const pendingProviderCreations = new Set<string>()
  const pendingProviderCreationStates = new Map<string, PendingProviderCreationState>()
  const removedDuringCreation = new Set<string>()
  // The leader owns remote writes. Keep one queue for each resolved provider
  // so an older response cannot overwrite a newer server configuration.
  const providerWriteQueues = new Map<string, Promise<void>>()
  const providerWriteVersions = new Map<string, number>()
  const providerWriteAliases = new Map<string, string>()
  let providerWriteGeneration = 0
  const providerCreationResolutions = ref<Record<string, string>>({})
  const providerValidationLeases = useLocalStorage<Record<string, ProviderValidationLease>>('settings/providers/validation-leases', {}, providerStorageOptions)

  function getPendingProviderCreationRequestedId(providerId: string) {
    if (pendingProviderCreations.has(providerId))
      return providerId

    return [...pendingProviderCreations].find(requestedId => resolveProviderId(requestedId) === providerId)
  }

  function capturePendingProviderCreationState(providerId: string) {
    const requestedId = getPendingProviderCreationRequestedId(providerId)
    if (!requestedId)
      return

    const resolvedId = resolveProviderId(requestedId)
    const provider = providers.value[resolvedId]
    if (!provider)
      return

    const validationLease = providerValidationLeases.value[resolvedId]
    pendingProviderCreationStates.set(requestedId, {
      provider: {
        ...provider,
        config: { ...provider.config },
      },
      ...(validationLease ? { validationLease: { ...validationLease } } : {}),
    })
  }

  function restorePendingProviderCreationState(requestedId: string, resolvedId: string) {
    const pendingState = pendingProviderCreationStates.get(requestedId)
    if (!pendingState)
      return

    providers.value[resolvedId] = {
      ...pendingState.provider,
      id: resolvedId,
      config: { ...pendingState.provider.config },
    }
    markProviderAdded(resolvedId)
    if (pendingState.validationLease)
      providerValidationLeases.value[resolvedId] = { ...pendingState.validationLease }
    else
      delete providerValidationLeases.value[resolvedId]
    return providers.value[resolvedId]
  }

  function completeProviderCreation(providerId: string) {
    pendingProviderCreations.delete(providerId)
    pendingProviderCreationStates.delete(providerId)
  }

  // A fresh synchronization domain has no editor instance left to finish or
  // cancel persisted validation work. Recover its last stable status before
  // this store publishes initial state. A joining tab will subsequently apply
  // the still-live domain snapshot instead.
  for (const [providerId, lease] of Object.entries(providerValidationLeases.value)) {
    const provider = providers.value[providerId]
    if (provider?.status === 'validating')
      provider.status = lease.previousStatus
    delete providerValidationLeases.value[providerId]
  }

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

  function enqueueProviderWrite<T>(providerId: string, write: () => Promise<T>) {
    const queueId = resolveProviderWriteId(providerId)
    const previous = providerWriteQueues.get(queueId) ?? Promise.resolve()
    const result = previous.then(write)
    const queueTail = result.then(
      () => undefined,
      () => undefined,
    )
    providerWriteQueues.set(queueId, queueTail)
    return result.finally(() => {
      for (const [queuedProviderId, tail] of providerWriteQueues) {
        if (tail === queueTail)
          providerWriteQueues.delete(queuedProviderId)
      }
    })
  }

  function resolveProviderId(providerId: string) {
    const visited = new Set<string>()
    let resolvedId = providerId
    while (providerCreationResolutions.value[resolvedId] && !visited.has(resolvedId)) {
      visited.add(resolvedId)
      resolvedId = providerCreationResolutions.value[resolvedId]
    }
    return resolvedId
  }

  function resolveProviderWriteId(providerId: string) {
    const visited = new Set<string>()
    let resolvedId = resolveProviderId(providerId)
    while (providerWriteAliases.has(resolvedId) && !visited.has(resolvedId)) {
      visited.add(resolvedId)
      resolvedId = providerWriteAliases.get(resolvedId)!
    }
    return resolvedId
  }

  function migrateProviderWriteId(previousId: string, canonicalId: string) {
    if (previousId === canonicalId)
      return

    providerWriteAliases.set(previousId, canonicalId)
    const queueTail = providerWriteQueues.get(previousId)
    if (queueTail)
      providerWriteQueues.set(canonicalId, queueTail)
    const currentWriteVersion = providerWriteVersions.get(previousId)
    if (currentWriteVersion !== undefined) {
      providerWriteVersions.set(canonicalId, currentWriteVersion)
      providerWriteVersions.delete(previousId)
    }
  }

  function getProvider(providerId: string) {
    return providers.value[resolveProviderId(providerId)]
  }

  function getProviderConfig(providerId: string) {
    return providers.value[resolveProviderId(providerId)]?.config
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
    providerId = resolveProviderId(providerId)
    const provider = providers.value[providerId]
    if (provider) {
      provider.status = status
      capturePendingProviderCreationState(providerId)
    }
  }

  /**
   * Updates the selected model in the leader-owned provider snapshot.
   *
   * Follower renderers must await this action instead of mutating replicated
   * configuration directly, because `state: true` proposals contain the full
   * store and can overwrite newer leader state.
   */
  async function setProviderModel(providerId: string, model: string) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    providers.value[providerId] = {
      ...provider,
      config: { ...provider.config, model },
    }
  }

  /**
   * Seeds a discovered default without replacing a model selected by the user.
   */
  async function setProviderModelIfUnset(providerId: string, model: string) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    const currentModel = provider.config.model
    if (typeof currentModel === 'string' && currentModel.length > 0)
      return

    providers.value[providerId] = {
      ...provider,
      config: { ...provider.config, model },
    }
  }

  async function beginProviderValidation(providerId: string, token = crypto.randomUUID()) {
    const resolvedProviderId = resolveProviderId(providerId)
    const provider = providers.value[resolvedProviderId]
    if (!provider)
      return

    const previousStatus = providerValidationLeases.value[resolvedProviderId]?.previousStatus ?? provider.status
    providerValidationLeases.value[resolvedProviderId] = { token, previousStatus }
    provider.status = 'validating'
    capturePendingProviderCreationState(resolvedProviderId)
    return { token, previousStatus }
  }

  function finishProviderValidationState(providerId: string, token: string, status: ProviderValidationStatus) {
    const resolvedProviderId = resolveProviderId(providerId)
    const requestedProviderId = getPendingProviderCreationRequestedId(resolvedProviderId)
    const pendingState = requestedProviderId
      ? pendingProviderCreationStates.get(requestedProviderId)
      : undefined
    const activeValidation = providerValidationLeases.value[resolvedProviderId] ?? pendingState?.validationLease
    if (activeValidation?.token !== token)
      return false

    const provider = providers.value[resolvedProviderId]
    const pendingProvider = pendingState?.provider
    const didTransition = provider?.status === 'validating' || (!provider && pendingProvider?.status === 'validating')
    if (provider?.status === 'validating') {
      provider.status = status
    }
    else if (!provider && pendingProvider?.status === 'validating' && requestedProviderId) {
      pendingProviderCreationStates.set(requestedProviderId, {
        provider: { ...pendingProvider, status },
      })
    }
    delete providerValidationLeases.value[resolvedProviderId]
    if (provider)
      capturePendingProviderCreationState(resolvedProviderId)
    return didTransition
  }

  async function finishProviderValidation(providerId: string, token: string, status: ProviderValidationStatus) {
    return finishProviderValidationState(providerId, token, status)
  }

  async function finishProviderValidationAndUpdateConfig(
    providerId: string,
    token: string,
    config?: Record<string, unknown>,
  ) {
    if (!finishProviderValidationState(providerId, token, 'configured'))
      return false

    // updateProviderConfig applies its optimistic state before its first await.
    // Keeping both calls in this leader action closes the token-check/commit gap.
    if (config)
      await updateProviderConfig(providerId, config, 'configured')
    return true
  }

  async function restoreProviderStatus(providerId: string, token: string) {
    const resolvedProviderId = resolveProviderId(providerId)
    const requestedProviderId = getPendingProviderCreationRequestedId(resolvedProviderId)
    const pendingState = requestedProviderId
      ? pendingProviderCreationStates.get(requestedProviderId)
      : undefined
    const activeValidation = providerValidationLeases.value[resolvedProviderId] ?? pendingState?.validationLease
    if (activeValidation?.token !== token)
      return false

    const provider = providers.value[resolvedProviderId]
    const pendingProvider = pendingState?.provider
    const didTransition = provider?.status === 'validating' || (!provider && pendingProvider?.status === 'validating')
    if (provider?.status === 'validating') {
      provider.status = activeValidation.previousStatus
    }
    else if (!provider && pendingProvider?.status === 'validating' && requestedProviderId) {
      pendingProviderCreationStates.set(requestedProviderId, {
        provider: { ...pendingProvider, status: activeValidation.previousStatus },
      })
    }
    delete providerValidationLeases.value[resolvedProviderId]
    if (provider)
      capturePendingProviderCreationState(resolvedProviderId)
    return didTransition
  }

  function mergeProviderSnapshot(snapshot: Record<string, InferenceServiceProvider>) {
    providers.value = { ...providers.value, ...snapshot }
    for (const providerId of Object.keys(snapshot))
      markProviderAdded(providerId)
  }

  async function fetchProviders() {
    try {
      const state = await providersQuery.refetch(true)
      if (state.data) {
        // The server snapshot has the highest priority for ids that exist remotely.
        mergeProviderSnapshot(state.data)
      }
      return providers.value
    }
    catch {
      // The merged local snapshot is authoritative while the remote endpoint is unavailable.
      return providers.value
    }
  }

  function prepareProviderAddition(definitionId: string, initialConfig: Record<string, unknown> = {}) {
    return service.buildLocal(definitionId, initialConfig)
  }

  function recordProviderCreationResolution(requestedId: string, resolvedId: string) {
    if (requestedId === resolvedId)
      return

    migrateProviderWriteId(resolveProviderWriteId(requestedId), resolvedId)
    providerCreationResolutions.value[requestedId] = resolvedId
    const validationLease = providerValidationLeases.value[requestedId]
    if (validationLease) {
      providerValidationLeases.value[resolvedId] = validationLease
      delete providerValidationLeases.value[requestedId]
    }
  }

  function applyProviderWriteResponse(
    requestedProviderId: string,
    remote: InferenceServiceProvider,
    writeVersion: number,
    writeGeneration: number,
  ) {
    if (providerWriteGeneration !== writeGeneration)
      return

    let resolvedProviderId = resolveProviderId(requestedProviderId)
    const previousWriteId = resolveProviderWriteId(requestedProviderId)
    if (remote.id !== previousWriteId)
      migrateProviderWriteId(previousWriteId, remote.id)

    const currentProvider = providers.value[resolvedProviderId]
    if (!currentProvider)
      return

    if (remote.id !== resolvedProviderId) {
      const wasAdded = addedProviders.value[resolvedProviderId]
      recordProviderCreationResolution(resolvedProviderId, remote.id)
      delete providers.value[resolvedProviderId]
      unmarkProviderAdded(resolvedProviderId)
      providers.value[remote.id] = { ...currentProvider, id: remote.id }
      if (wasAdded)
        markProviderAdded(remote.id)
      resolvedProviderId = remote.id
    }

    if (providerWriteVersions.get(resolvedProviderId) !== writeVersion)
      return

    const latestProvider = providers.value[resolvedProviderId]
    const activeValidation = providerValidationLeases.value[resolvedProviderId]
    providers.value[resolvedProviderId] = activeValidation && latestProvider?.status === 'validating'
      ? { ...remote, id: resolvedProviderId, status: 'validating' }
      : { ...remote, id: resolvedProviderId }
  }

  async function discardRemovedProviderCreation(requestedId: string, resolvedId: string) {
    if (!removedDuringCreation.delete(requestedId))
      return false

    delete providers.value[requestedId]
    delete providers.value[resolvedId]
    unmarkProviderAdded(requestedId)
    unmarkProviderAdded(resolvedId)
    delete providerValidationLeases.value[requestedId]
    delete providerValidationLeases.value[resolvedId]
    delete providerCreationResolutions.value[requestedId]
    try {
      await removeProviderMutation.mutateAsync(resolvedId)
    }
    catch {
      // Keep the local deletion authoritative if cleanup cannot reach the server.
    }
    completeProviderCreation(requestedId)
    return true
  }

  async function synchronizeAddedProvider(provider: InferenceServiceProvider) {
    const initialMutationKey = createProviderMutationKey(provider)
    pendingProviderCreations.add(provider.id)
    removedDuringCreation.delete(provider.id)
    delete providerCreationResolutions.value[provider.id]
    providers.value[provider.id] = provider
    markProviderAdded(provider.id)
    capturePendingProviderCreationState(provider.id)

    try {
      const remote = await addProviderMutation.mutateAsync(provider)

      // A delete tombstone always wins. Otherwise, owner-captured state is newer
      // than a replicated full snapshot that can still contain a stale provider.
      if (await discardRemovedProviderCreation(provider.id, remote.id))
        return remote

      const pendingState = pendingProviderCreationStates.get(provider.id)
      let current = pendingState?.provider ?? providers.value[provider.id]
      if (pendingState?.validationLease)
        providerValidationLeases.value[provider.id] = pendingState.validationLease
      if (!current) {
        if (!pendingState) {
          providers.value[remote.id] = remote
          markProviderAdded(remote.id)
          recordProviderCreationResolution(provider.id, remote.id)
          completeProviderCreation(provider.id)
          return remote
        }
        current = pendingState.provider
      }

      delete providers.value[provider.id]
      unmarkProviderAdded(provider.id)
      const validationLease = providerValidationLeases.value[provider.id]
      const wasModified = createProviderMutationKey(current, validationLease?.previousStatus) !== initialMutationKey
      const reconciled = wasModified
        ? {
            ...remote,
            config: current.config,
            status: current.status,
          }
        : validationLease
          ? {
              ...remote,
              status: current.status,
            }
          : remote
      providers.value[remote.id] = reconciled
      markProviderAdded(remote.id)
      recordProviderCreationResolution(provider.id, remote.id)
      capturePendingProviderCreationState(remote.id)
      const stateBeforeReconciliation = pendingProviderCreationStates.get(provider.id)

      if (!wasModified) {
        completeProviderCreation(provider.id)
        return remote
      }

      try {
        const saved = await enqueueProviderWrite(remote.id, () => updateProviderMutation.mutateAsync({
          providerId: remote.id,
          config: reconciled.config,
          status: validationLease?.previousStatus ?? reconciled.status,
        }))
        if (await discardRemovedProviderCreation(provider.id, remote.id))
          return saved
        const shouldApplySaved = providers.value[remote.id] === reconciled
        const stateChangedDuringReconciliation
          = pendingProviderCreationStates.get(provider.id) !== stateBeforeReconciliation
        const restored = restorePendingProviderCreationState(provider.id, remote.id)
        if (shouldApplySaved) {
          const activeValidation = providerValidationLeases.value[remote.id]
          const statusToPreserve = stateChangedDuringReconciliation
            ? restored?.status ?? (activeValidation ? reconciled.status : undefined)
            : validationLease
              ? reconciled.status
              : undefined
          providers.value[remote.id] = statusToPreserve
            ? { ...saved, status: statusToPreserve }
            : saved
        }
        completeProviderCreation(provider.id)
        return saved
      }
      catch {
        if (await discardRemovedProviderCreation(provider.id, remote.id))
          return remote
        // Preserve the user's newer configuration when the reconciliation fails.
        const restored = restorePendingProviderCreationState(provider.id, remote.id)
        completeProviderCreation(provider.id)
        return restored ?? reconciled
      }
    }
    catch {
      // A failed remote create does not discard the local provider.
      const wasRemoved = removedDuringCreation.delete(provider.id)
      const restored = wasRemoved
        ? undefined
        : restorePendingProviderCreationState(provider.id, provider.id)
      completeProviderCreation(provider.id)
      return restored ?? provider
    }
  }

  async function addProvider(definitionId: string, initialConfig: Record<string, unknown> = {}) {
    const provider = prepareProviderAddition(definitionId, initialConfig)
    return synchronizeAddedProvider(provider)
  }

  async function removeProvider(providerId: string) {
    const requestedProviderId = getPendingProviderCreationRequestedId(providerId) ?? providerId
    providerId = resolveProviderId(providerId)
    if (!providers.value[providerId] && !pendingProviderCreations.has(requestedProviderId))
      return

    providerWriteVersions.set(providerId, (providerWriteVersions.get(providerId) ?? 0) + 1)
    if (pendingProviderCreations.has(requestedProviderId))
      removedDuringCreation.add(requestedProviderId)
    delete providers.value[providerId]
    unmarkProviderAdded(providerId)
    delete providerValidationLeases.value[providerId]
    delete providerCreationResolutions.value[providerId]
    for (const [requestedId, resolvedId] of Object.entries(providerCreationResolutions.value)) {
      if (resolvedId === providerId)
        delete providerCreationResolutions.value[requestedId]
    }

    try {
      await enqueueProviderWrite(providerId, () => removeProviderMutation.mutateAsync(resolveProviderWriteId(providerId)))
    }
    catch {
      // A failed remote delete does not restore a provider that the user removed locally.
    }
  }

  async function updateProviderConfig(providerId: string, config: Record<string, unknown>, status: ProviderValidationStatus) {
    providerId = resolveProviderId(providerId)
    const provider = providers.value[providerId]
    if (!provider)
      return

    const writeVersion = (providerWriteVersions.get(providerId) ?? 0) + 1
    providerWriteVersions.set(providerId, writeVersion)
    const writeGeneration = providerWriteGeneration
    const localProvider = {
      ...provider,
      config: { ...config },
      status,
    }
    providers.value[providerId] = localProvider
    capturePendingProviderCreationState(providerId)

    try {
      const remote = await enqueueProviderWrite(providerId, async () => {
        const resolvedWriteProviderId = resolveProviderWriteId(providerId)
        if (providerWriteGeneration !== writeGeneration
          || providerWriteVersions.get(resolvedWriteProviderId) !== writeVersion
          || !providers.value[resolveProviderId(providerId)]) {
          return providers.value[resolveProviderId(providerId)] ?? localProvider
        }
        const saved = await updateProviderMutation.mutateAsync({
          providerId: resolvedWriteProviderId,
          config,
          status,
        })
        // Apply canonical id changes before the queue releases its next write.
        applyProviderWriteResponse(providerId, saved, writeVersion, writeGeneration)
        return saved
      })
      return remote
    }
    catch {
      // A failed remote update keeps the local provider configuration.
      return localProvider
    }
  }

  async function resetProviders() {
    providerWriteGeneration += 1
    providerWriteVersions.clear()
    providerWriteAliases.clear()
    for (const providerId of pendingProviderCreations)
      removedDuringCreation.add(providerId)
    providers.value = {}
    addedProviders.value = {}
    providerValidationLeases.value = {}
    providerCreationResolutions.value = {}
  }

  return {
    providers,
    configs,
    addedProviders,
    listedProviders,
    configuredProviders,
    providerValidationLeases,
    providerCreationResolutions,
    isLoading: computed(() => providersQuery.isLoading.value),
    error: computed(() => providersQuery.error.value),
    mutationError,

    getProvider,
    getProviderConfig,
    resolveProviderId,
    ensureProvider,
    markProviderAdded,
    unmarkProviderAdded,
    setProviderStatus,
    setProviderModel,
    setProviderModelIfUnset,
    beginProviderValidation,
    finishProviderValidation,
    finishProviderValidationAndUpdateConfig,
    restoreProviderStatus,
    fetchProviders,
    prepareProviderAddition,
    synchronizeAddedProvider,
    addProvider,
    removeProvider,
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
      'setProviderModel',
      'setProviderModelIfUnset',
      'beginProviderValidation',
      'finishProviderValidation',
      'finishProviderValidationAndUpdateConfig',
      'restoreProviderStatus',
      'synchronizeAddedProvider',
      'addProvider',
      'removeProvider',
      'updateProviderConfig',
      'resetProviders',
    ],
    state: true,
  },
})
