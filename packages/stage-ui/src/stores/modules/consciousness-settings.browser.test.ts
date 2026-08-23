import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useConsciousnessSettingsStore } from './consciousness-settings'

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('consciousness settings synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
  })

  it('applies one remote snapshot without publishing it again', async () => {
    const namespace = `consciousness-settings:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderStore = useConsciousnessSettingsStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useConsciousnessSettingsStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    let leaderMutations = 0
    let followerMutations = 0
    let followerActions = 0
    leaderStore.$subscribe(() => leaderMutations++, { flush: 'sync' })
    followerStore.$subscribe(() => followerMutations++, { flush: 'sync' })
    followerStore.$onAction(() => followerActions++)

    leaderStore.reasoning = true
    await vi.waitFor(() => expect(followerStore.reasoning).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(leaderMutations).toBe(1)
    expect(followerMutations).toBe(1)
    expect(followerActions).toBe(0)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBeNull()
  })

  it('persists a follower update through one leader-owned action', async () => {
    const namespace = `consciousness-settings:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderStore = useConsciousnessSettingsStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useConsciousnessSettingsStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    let leaderActions = 0
    leaderStore.$onAction(({ name }) => {
      if (name === 'setReasoning')
        leaderActions++
    })

    await followerStore.setReasoning(true)
    await vi.waitFor(() => expect(followerStore.reasoning).toBe(true))

    expect(leaderStore.reasoning).toBe(true)
    expect(leaderActions).toBe(1)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('true')
  })
})
