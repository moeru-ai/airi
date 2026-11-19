import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAvatarTouchStore } from './avatar-touch'

const handleSparkNotify = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('./orchestrator', () => ({
  useCharacterOrchestratorStore: () => ({ handleSparkNotify }),
}))

const syncedContexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('avatar touch notifications', () => {
  afterEach(() => {
    handleSparkNotify.mockClear()
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
  })

  it('routes a touch from a follower window to the leader, once for each cooldown', async () => {
    const namespace = `avatar-touch:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    useAvatarTouchStore()

    const follower = createSyncedContext(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useAvatarTouchStore()

    const summary = { region: 'head' as const, taps: 0, pats: 4 }
    await expect(followerStore.notifyTouch(summary)).resolves.toBe('sent')
    await expect(followerStore.notifyTouch(summary)).resolves.toBe('cooldown')

    expect(handleSparkNotify).toHaveBeenCalledOnce()
    expect(handleSparkNotify).toHaveBeenCalledWith(expect.objectContaining({
      type: 'spark:notify',
      source: 'character:avatar-touch',
      data: expect.objectContaining({ headline: 'The user patted your head (4 times).', destinations: ['character'] }),
    }))
  })
})
