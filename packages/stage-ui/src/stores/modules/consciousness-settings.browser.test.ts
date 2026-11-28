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

  it.each([
    {
      field: 'reasoning',
      apply: (store: ReturnType<typeof useConsciousnessSettingsStore>) => {
        store.reasoning = 'enabled'
      },
      read: (store: ReturnType<typeof useConsciousnessSettingsStore>) => store.reasoning,
      expected: 'enabled',
    },
    {
      field: 'temperatureEnabled',
      apply: (store: ReturnType<typeof useConsciousnessSettingsStore>) => {
        store.temperatureEnabled = true
      },
      read: (store: ReturnType<typeof useConsciousnessSettingsStore>) => store.temperatureEnabled,
      expected: true,
    },
    {
      field: 'topPEnabled',
      apply: (store: ReturnType<typeof useConsciousnessSettingsStore>) => {
        store.topPEnabled = true
      },
      read: (store: ReturnType<typeof useConsciousnessSettingsStore>) => store.topPEnabled,
      expected: true,
    },
  ])('applies a remote $field snapshot without publishing it again', async ({ apply, read, expected }) => {
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

    apply(leaderStore)
    await vi.waitFor(() => expect(read(followerStore)).toBe(expected))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(leaderMutations).toBe(1)
    expect(followerMutations).toBe(1)
    expect(followerActions).toBe(0)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBeNull()
    expect(localStorage.getItem('settings/consciousness/temperature-enabled')).toBeNull()
    expect(localStorage.getItem('settings/consciousness/top-p-enabled')).toBeNull()
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

    await followerStore.setReasoning('enabled')
    await vi.waitFor(() => expect(followerStore.reasoning).toBe('enabled'))

    expect(leaderStore.reasoning).toBe('enabled')
    expect(leaderActions).toBe(1)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('enabled')

    await followerStore.setReasoning('disabled')
    await vi.waitFor(() => expect(followerStore.reasoning).toBe('disabled'))

    expect(leaderStore.reasoning).toBe('disabled')
    expect(leaderActions).toBe(2)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('disabled')

    await followerStore.setTemperatureEnabled(true)
    await followerStore.setTopPEnabled(true)
    await vi.waitFor(() => expect(followerStore.temperatureEnabled).toBe(true))
    await vi.waitFor(() => expect(followerStore.topPEnabled).toBe(true))
    expect(leaderStore.temperatureEnabled).toBe(true)
    expect(leaderStore.topPEnabled).toBe(true)
    expect(localStorage.getItem('settings/consciousness/temperature-enabled')).toBe('true')
    expect(localStorage.getItem('settings/consciousness/top-p-enabled')).toBe('true')

    await followerStore.resetState()
    await vi.waitFor(() => expect(followerStore.reasoning).toBe('default'))
    await vi.waitFor(() => expect(followerStore.temperatureEnabled).toBe(false))
    await vi.waitFor(() => expect(followerStore.topPEnabled).toBe(false))
    expect(leaderStore.reasoning).toBe('default')
    expect(leaderStore.temperatureEnabled).toBe(false)
    expect(leaderStore.topPEnabled).toBe(false)
    expect(localStorage.getItem('settings/consciousness/reasoning')).toBe('default')
    expect(localStorage.getItem('settings/consciousness/temperature-enabled')).toBe('false')
    expect(localStorage.getItem('settings/consciousness/top-p-enabled')).toBe('false')
  })
})
