import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useProviderConfigStore } from './config'

const mocks = vi.hoisted(() => ({
  client: {},
  service: {
    buildLocal: vi.fn(),
    fetchRemote: vi.fn(),
    createRemote: vi.fn(),
    deleteRemote: vi.fn(),
    patchConfigRemote: vi.fn(),
  },
}))

vi.mock('../../composables/api', () => ({ client: mocks.client }))
vi.mock('../../services/inference-service-providers', () => ({ inferenceServiceProvidersService: mocks.service }))
vi.mock('../../libs/providers', () => ({
  getDefinedProvider: vi.fn(() => ({ id: 'openai-compatible', name: 'OpenAI Compatible' })),
}))

const localProvider = {
  id: 'local-provider',
  definitionId: 'openai-compatible',
  config: {},
  status: 'unconfigured',
  configuredBy: 'user',
} satisfies InferenceServiceProvider

const remoteProvider = {
  ...localProvider,
  id: 'remote-provider',
} satisfies InferenceServiceProvider

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('provider config synchronization', () => {
  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('keeps optimistic creation synchronous and synchronizes a serializable provider', async () => {
    let resolveRemote!: (provider: InferenceServiceProvider) => void
    mocks.service.buildLocal.mockReturnValue(localProvider)
    mocks.service.createRemote.mockReturnValue(new Promise<InferenceServiceProvider>((resolve) => {
      resolveRemote = resolve
    }))
    const namespace = `provider-config:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const optimistic = followerStore.prepareProviderAddition(localProvider.definitionId)

    expect(optimistic).toEqual(localProvider)
    const synchronized = followerStore.synchronizeAddedProvider(optimistic)
    await vi.waitFor(() => {
      expect(leaderStore.providers[localProvider.id]).toEqual(localProvider)
      expect(followerStore.providers[localProvider.id]).toEqual(localProvider)
    })

    resolveRemote(remoteProvider)
    await expect(synchronized).resolves.toEqual(remoteProvider)
    await vi.waitFor(() => {
      expect({
        leader: leaderStore.providers,
        follower: followerStore.providers,
      }).toEqual({
        leader: { [remoteProvider.id]: remoteProvider },
        follower: { [remoteProvider.id]: remoteProvider },
      })
    }, { timeout: 3000 })
  })
})
