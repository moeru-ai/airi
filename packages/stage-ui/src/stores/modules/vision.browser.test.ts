import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useVisionStore } from './vision/store'

vi.mock('../providers/provider', () => ({
  useProviderStore: () => ({
    fetchModelsForProvider: vi.fn(),
    getModelsForProvider: vi.fn(() => []),
    isLoadingModels: {},
    modelLoadError: {},
    supportsModelListing: vi.fn(() => false),
  }),
}))

const syncedContexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({})
    .use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
    .use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('vision settings synchronization', () => {
  beforeEach(() => localStorage.clear())

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
  })

  it('applies a remote chat-vision setting without publishing a follower proposal', async () => {
    const namespace = `vision:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderStore = useVisionStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useVisionStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    let leaderMutations = 0
    let followerMutations = 0
    leaderStore.$subscribe(() => leaderMutations++, { flush: 'sync' })
    followerStore.$subscribe(() => followerMutations++, { flush: 'sync' })

    leaderStore.useForChat = false
    await vi.waitFor(() => expect(followerStore.useForChat).toBe(false))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(leaderMutations).toBe(1)
    expect(followerMutations).toBe(1)
  })
})
