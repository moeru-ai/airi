import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAiriCardStore } from './airi-card'

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('airi card Live2D control synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ voices: [], recommended: {}, data: [] })))
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('routes a follower policy update through the leader once', async () => {
    const namespace = `airi-card-controls:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderStore = useAiriCardStore()
    await leaderStore.initialize()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerStore = useAiriCardStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerStore.cards.has('default')).toBe(true))

    let leaderActions = 0
    let followerActions = 0
    leaderStore.$onAction(({ name }) => {
      if (name === 'updateLive2DControlPolicy')
        leaderActions += 1
    })
    followerStore.$onAction(({ name }) => {
      if (name === 'updateLive2DControlPolicy')
        followerActions += 1
    })

    const policy = {
      disabledExpressions: ['sad'],
      disabledMotions: ['idle.motion3.json'],
    }
    await followerStore.updateLive2DControlPolicy('default', 'default-live2d-avatar-model', policy)

    await vi.waitFor(() => {
      expect(followerStore.selectedAvatarModel?.type).toBe('live2d')
      if (followerStore.selectedAvatarModel?.type === 'live2d')
        expect(followerStore.selectedAvatarModel.config.controls).toEqual(policy)
    })

    expect(leaderStore.selectedAvatarModel?.type).toBe('live2d')
    if (leaderStore.selectedAvatarModel?.type === 'live2d')
      expect(leaderStore.selectedAvatarModel.config.controls).toEqual(policy)
    expect(leaderActions).toBe(1)
    expect(followerActions).toBe(0)
  })
})
