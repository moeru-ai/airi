import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

const analyticsMock = vi.hoisted(() => ({
  trackMicrophonePermissionDenied: vi.fn(),
  trackSttFailed: vi.fn(),
  trackSttSucceeded: vi.fn(),
  trackVoiceInputStarted: vi.fn(),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => analyticsMock,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (key: string) => key,
  }),
}))

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

describe('hearing provider reconciliation synchronization', () => {
  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('routes follower alias migration through the synchronized leader action', async () => {
    const { useHearingStore } = await import('./hearing')
    const { useProviderConfigStore } = await import('../providers/config')
    const namespace = `hearing-provider-reconciliation:${crypto.randomUUID()}`

    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderHearingStore = useHearingStore()
    const leaderActions: string[] = []
    leaderHearingStore.$onAction(({ name }) => leaderActions.push(name))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerHearingStore = useHearingStore()
    const followerProviderStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    leaderHearingStore.activeTranscriptionProvider = 'local-provider'
    await vi.waitFor(() => expect(followerHearingStore.activeTranscriptionProvider).toBe('local-provider'))

    // A replicated provider-config snapshot can make the alias visible first
    // in a follower. The follower must delegate the Hearing mutation instead
    // of publishing its complete, potentially stale Hearing state.
    followerProviderStore.providerCreationResolutions['local-provider'] = 'remote-provider'

    await vi.waitFor(() => {
      expect(leaderHearingStore.activeTranscriptionProvider).toBe('remote-provider')
      expect(followerHearingStore.activeTranscriptionProvider).toBe('remote-provider')
    })
    expect(leaderActions).toContain('reconcileActiveTranscriptionProviderId')
  })
})
