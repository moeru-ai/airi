import type {} from 'pinia-plugin-synced'

import type { InferenceServiceProvider, ProviderValidationStatus } from '../../libs/providers/types'
import type { ProviderReplicaRow } from '../../services/inference-service-providers'
import type { ProviderSyncRow, ProviderSyncSnapshot } from './merge'

import { useDebounceFn, useLocalStorage } from '@vueuse/core'
import { isEqual } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { client } from '../../composables/api'
import { getDefinedProvider } from '../../libs/providers'
import { inferenceServiceProvidersService as service } from '../../services/inference-service-providers'
import { useAuthStore } from '../auth'
import { mergeProviderSync } from './merge'

const providerStorageOptions = {
  // pinia-plugin-synced is the only cross-window propagation channel for this
  // store. Listening to storage events would feed replicated state back into
  // the leader as a new state proposal.
  listenToStorageChanges: false,
} as const

const PUSH_DEBOUNCE_MS = 1000

type StoredProvider = InferenceServiceProvider & {
  replicaUpdatedAt?: string
}

function isUserProvider(provider: InferenceServiceProvider) {
  return provider.configuredBy !== 'authentication'
}

/**
 * Local providers are the primary copy. Cloud is a replica: pull on login,
 * push after a debounce. Upsert only configured rows. Do not upload status.
 * Merge prefers a config that works on this device, then replica time.
 */
export const useProviderConfigStore = defineStore('provider-config', () => {
  const authStore = useAuthStore()
  const providers = useLocalStorage<Record<string, StoredProvider>>('settings/providers/configured', {}, providerStorageOptions)
  const addedProviders = useLocalStorage<Record<string, boolean>>('settings/providers/added', {}, providerStorageOptions)
  const pendingDeletes = useLocalStorage<Record<string, string | null>>('settings/providers/pending-deletes', {}, providerStorageOptions)
  const legacyConfigs = useLocalStorage<Record<string, Record<string, unknown>>>('settings/credentials/providers', {}, providerStorageOptions)

  let lastLiveRemote: Record<string, ProviderReplicaRow> = {}
  let replicaMerged = false
  let syncInFlight: Promise<void> | undefined
  const afterSyncHooks: Array<() => void | Promise<void>> = []
  let remoteWorkingCheck: ((row: ProviderReplicaRow) => Promise<boolean>) | undefined

  function onAfterSync(hook: () => void | Promise<void>) {
    afterSyncHooks.push(hook)
    return () => {
      const index = afterSyncHooks.indexOf(hook)
      if (index >= 0)
        afterSyncHooks.splice(index, 1)
    }
  }

  function onRemoteWorking(check: (row: ProviderReplicaRow) => Promise<boolean>) {
    remoteWorkingCheck = check
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

  // Uploaded fields only. status and replicaUpdatedAt stay local; a successful
  // push writes replicaUpdatedAt and must not look like a new local edit.
  function replicaBody(row: { definitionId: string, config: Record<string, unknown> }) {
    return { definitionId: row.definitionId, config: row.config }
  }

  function snapshotLocal(): ProviderSyncSnapshot {
    const live: Record<string, ProviderSyncRow> = {}
    for (const provider of Object.values(providers.value)) {
      if (!isUserProvider(provider))
        continue
      live[provider.id] = {
        id: provider.id,
        ...replicaBody(provider),
        replicaUpdatedAt: provider.replicaUpdatedAt,
      }
    }
    return {
      live,
      pendingDeletes: { ...pendingDeletes.value },
    }
  }

  function indexAcceptedReplica(merged: ProviderSyncSnapshot, remote: ProviderReplicaRow[]) {
    const remoteLiveIds = new Set(remote.filter(row => !row.deletedAt).map(row => row.id))
    const next: Record<string, ProviderReplicaRow> = {}
    for (const row of Object.values(merged.live)) {
      if (!remoteLiveIds.has(row.id))
        continue
      next[row.id] = {
        id: row.id,
        definitionId: row.definitionId,
        config: { ...row.config },
        updatedAt: row.replicaUpdatedAt ?? '',
        deletedAt: null,
      }
    }
    lastLiveRemote = next
  }

  function isDirty(provider: StoredProvider) {
    const remote = lastLiveRemote[provider.id]
    if (!remote)
      return true
    return !isEqual(replicaBody(provider), replicaBody(remote))
  }

  const schedulePush = useDebounceFn(() => {
    void pushProviders()
  }, PUSH_DEBOUNCE_MS)

  // Nested config writes skip actions, so the replica payload is watched.
  const replicaSignature = computed(() => {
    const snapshot = snapshotLocal()
    const live = Object.fromEntries(
      Object.entries(snapshot.live).map(([id, row]) => [id, replicaBody(row)]),
    )
    return JSON.stringify({
      live,
      pendingDeletes: snapshot.pendingDeletes,
    })
  })

  watch(replicaSignature, () => {
    void schedulePush()
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

    const provider: StoredProvider = {
      id: providerId,
      definitionId,
      config,
      status: 'unconfigured',
      configuredBy: definition.configuredBy ?? 'user',
    }
    providers.value[providerId] = provider
    delete pendingDeletes.value[providerId]
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
    if (!provider)
      return

    provider.status = status
    // Config often changes first; validation marks configured later.
    // Push then, or a finished key never uploads.
    if (status === 'configured')
      schedulePush()
  }

  /**
   * Applies configuration fields to an existing provider record.
   *
   * The caller must initialize the provider before this action runs. A new
   * configuration object makes persistence and state replication observable.
   */
  function patchProviderConfig(providerId: string, config: Record<string, unknown>) {
    const provider = providers.value[providerId]
    if (!provider)
      return false

    providers.value[providerId] = {
      ...provider,
      config: { ...provider.config, ...config },
    }
    return true
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
    schedulePush()
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
    schedulePush()
  }

  function applyMerged(merged: ProviderSyncSnapshot) {
    const previousIds = new Set(Object.keys(providers.value))
    const next: Record<string, StoredProvider> = {}
    for (const [id, provider] of Object.entries(providers.value)) {
      if (!isUserProvider(provider))
        next[id] = provider
    }

    for (const [id, provider] of Object.entries(providers.value)) {
      if (isUserProvider(provider) && !merged.live[id])
        unmarkProviderAdded(id)
    }

    for (const [id, row] of Object.entries(merged.live)) {
      const current = providers.value[id]
      next[id] = {
        id: row.id,
        definitionId: row.definitionId,
        config: row.config,
        replicaUpdatedAt: row.replicaUpdatedAt,
        status: current?.status ?? 'unconfigured',
        configuredBy: 'user',
      }
      if (!previousIds.has(id))
        markProviderAdded(id)
    }

    providers.value = next
    pendingDeletes.value = merged.pendingDeletes
  }

  function localWorkingIds() {
    const ids = new Set<string>()
    for (const provider of Object.values(providers.value)) {
      if (isUserProvider(provider) && provider.status === 'configured')
        ids.add(provider.id)
    }
    return ids
  }

  async function remoteWorkingIds(remote: ProviderReplicaRow[]) {
    const ids = new Set<string>()
    for (const row of remote) {
      if (row.deletedAt)
        continue
      if (!remoteWorkingCheck) {
        ids.add(row.id)
        continue
      }
      try {
        if (await remoteWorkingCheck(row))
          ids.add(row.id)
      }
      catch {}
    }
    return ids
  }

  async function syncProviders() {
    if (!authStore.isAuthenticated)
      return

    if (syncInFlight) {
      await syncInFlight
      return syncProviders()
    }

    syncInFlight = (async () => {
      try {
        const remote = await service.listRemote(client)
        const merged = mergeProviderSync(snapshotLocal(), remote, {
          local: localWorkingIds(),
          remote: await remoteWorkingIds(remote),
        })
        applyMerged(merged)
        indexAcceptedReplica(merged, remote)
        replicaMerged = true
      }
      catch {
        return
      }
      await pushProviders()
      for (const hook of afterSyncHooks)
        await hook()
    })()

    try {
      await syncInFlight
    }
    finally {
      syncInFlight = undefined
    }
  }

  async function pushProviders() {
    if (!authStore.isAuthenticated)
      return

    const toUpsert = Object.values(providers.value).filter(provider =>
      isUserProvider(provider) && isDirty(provider) && provider.status === 'configured',
    )

    if (!replicaMerged) {
      if (toUpsert.length === 0 && Object.keys(pendingDeletes.value).length === 0)
        return
      return syncProviders()
    }

    for (const provider of toUpsert) {
      try {
        const remote = await service.upsertRemote(client, {
          id: provider.id,
          definitionId: provider.definitionId,
          config: provider.config,
        })
        const current = providers.value[provider.id]
        if (current)
          current.replicaUpdatedAt = remote.updatedAt
        lastLiveRemote[provider.id] = remote
      }
      catch {
        return
      }
    }

    for (const id of Object.keys(pendingDeletes.value)) {
      try {
        await service.deleteRemote(client, id)
        delete pendingDeletes.value[id]
        delete lastLiveRemote[id]
      }
      catch {
        return
      }
    }
  }

  authStore.onAuthenticated(() => {
    void syncProviders()
  })

  async function addProvider(definitionId: string, initialConfig: Record<string, unknown> = {}) {
    const provider = ensureProvider(nanoid(), definitionId, initialConfig)
    markProviderAdded(provider.id)
    schedulePush()
    return provider
  }

  async function removeProvider(providerId: string) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    if (isUserProvider(provider))
      pendingDeletes.value[providerId] = new Date().toISOString()

    delete providers.value[providerId]
    unmarkProviderAdded(providerId)
    delete lastLiveRemote[providerId]
    schedulePush()
  }

  async function updateProviderConfig(providerId: string, config: Record<string, unknown>, status: ProviderValidationStatus) {
    const provider = providers.value[providerId]
    if (!provider)
      return

    const next: StoredProvider = {
      ...provider,
      config: { ...config },
      status,
    }
    providers.value[providerId] = next
    schedulePush()
    return next
  }

  async function resetProviders() {
    providers.value = {}
    addedProviders.value = {}
    pendingDeletes.value = {}
    lastLiveRemote = {}
    replicaMerged = false
  }

  return {
    providers,
    configs,
    addedProviders,
    pendingDeletes,
    listedProviders,
    configuredProviders,

    getProvider,
    getProviderConfig,
    ensureProvider,
    markProviderAdded,
    unmarkProviderAdded,
    setProviderStatus,
    patchProviderConfig,
    setProviderModel,
    setProviderModelIfUnset,
    syncProviders,
    pushProviders,
    addProvider,
    removeProvider,
    updateProviderConfig,
    resetProviders,
    onAfterSync,
    onRemoteWorking,
  }
}, {
  synced: {
    actions: [
      'ensureProvider',
      'markProviderAdded',
      'unmarkProviderAdded',
      'setProviderStatus',
      'setProviderModel',
      'setProviderModelIfUnset',
      'syncProviders',
      'pushProviders',
      'addProvider',
      'removeProvider',
      'updateProviderConfig',
      'resetProviders',
    ],
    state: true,
  },
})
