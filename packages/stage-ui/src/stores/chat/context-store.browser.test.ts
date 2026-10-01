import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ContextMessage } from '../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useChatContextStore } from './context-store'

const windows: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime, store: ReturnType<typeof useChatContextStore> }> = []

function createWindow(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 1000 })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  const store = useChatContextStore(pinia)
  const window = { pinia, runtime, store }
  windows.push(window)
  return window
}

function observation(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: 'observation',
    contextId: 'events',
    strategy: ContextUpdateStrategy.AppendSelf,
    text: 'One event',
    createdAt: Date.now(),
    metadata: { source: { id: 'sensor' } },
    destinations: { include: ['owner:private'] },
    ...overrides,
  }
}

afterEach(() => {
  for (const window of windows.splice(0)) {
    window.store.$dispose()
    window.runtime.dispose()
    disposePinia(window.pinia)
  }
})

describe('context registry ownership', () => {
  it('routes writer removal to the owner and rejects late copies without new mutations', async () => {
    const namespace = `context-removal:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    const event = observation({ metadata: { source: { extension: { id: 'weather' }, id: 'station' } } })
    await follower.store.ingestContextMessage(event)
    await follower.store.ingestContextMessage(observation({ id: 'sibling', metadata: { source: { extension: { id: 'other-weather' }, id: 'station' } } }))
    await vi.waitFor(() => expect(Object.keys(follower.store.activeContexts)).toHaveLength(2))

    expect(await follower.store.removeContextWriter('weather:station', 'removal')).toBe(true)
    await vi.waitFor(() => expect(Object.keys(follower.store.activeContexts)).toEqual(['other-weather:station']))
    expect(Object.keys(leader.store.activeContexts)).toEqual(['other-weather:station'])
    let mutations = 0
    leader.store.$subscribe(() => mutations++, { flush: 'sync' })
    expect(await follower.store.removeContextWriter('weather:station', 'removal')).toBe(false)
    expect(await follower.store.ingestContextMessage(event)).toBeUndefined()
    expect(mutations).toBe(0)
    expect(leader.store.contextHistory).toHaveLength(2)
    await follower.store.ingestContextMessage({ ...event, id: 'reconnected' })
    await vi.waitFor(() => expect(follower.store.activeContexts['weather:station']?.[0]?.id).toBe('reconnected'))
    expect(await follower.store.removeContextWriter('weather:station', 'removal')).toBe(false)
    expect(leader.store.activeContexts['weather:station']?.[0]?.id).toBe('reconnected')
    expect(await follower.store.removeContextWriter('weather:station', 'next-removal')).toBe(true)
    await vi.waitFor(() => expect(follower.store.activeContexts['weather:station']).toBeUndefined())
  })

  // ROOT CAUSE:
  // Each renderer mutated its own registry. Broadcast copies replayed append events and diverged on expiry.
  it('routes follower writes to one owner and deduplicates copied deliveries', async () => {
    const namespace = `context-owner:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    const event = observation()

    await follower.store.ingestContextMessage(event)
    expect(leader.store.activeContexts.sensor).toHaveLength(1)
    await leader.store.ingestContextMessage({ ...event, createdAt: event.createdAt + 1 })
    await vi.waitFor(() => expect(follower.store.activeContexts.sensor).toHaveLength(1))
    expect(leader.store.contextHistory).toHaveLength(1)
    expect(follower.store.contextHistory).toHaveLength(1)
  })

  it('replicates snapshots without producing follower mutations from reads', async () => {
    const namespace = `context-read:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await leader.store.ingestContextMessage(observation())
    await vi.waitFor(() => expect(follower.store.activeContexts.sensor).toHaveLength(1))
    let leaderMutations = 0
    let followerMutations = 0
    leader.store.$subscribe(() => leaderMutations++, { flush: 'sync' })
    follower.store.$subscribe(() => followerMutations++, { flush: 'sync' })

    expect(follower.store.getContextsSnapshot({ ids: ['discord:channel:a'] })).toEqual({})
    expect(follower.store.getContextsSnapshot({ ids: ['owner:private'] }).sensor).toHaveLength(1)
    follower.store.getContextBucketsSnapshot()
    expect(leaderMutations).toBe(0)
    expect(followerMutations).toBe(0)
  })

  it('hides expired observations on reads without proposing state changes', async () => {
    const namespace = `context-expired-read:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    const event = observation({ ttlMs: 60_000 })
    await leader.store.ingestContextMessage(event)
    await vi.waitFor(() => expect(follower.store.activeContexts.sensor).toHaveLength(1))
    let mutations = 0
    follower.store.$subscribe(() => mutations++, { flush: 'sync' })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(event.createdAt + 60_000)
    try {
      expect(follower.store.getContextsSnapshot()).toEqual({})
      expect(follower.store.registryState.active.sensor).toHaveLength(1)
      expect(mutations).toBe(0)
    }
    finally {
      clock.mockRestore()
    }
  })

  it('prunes idle observations through one owner and stops its cleanup on disposal', async () => {
    const namespace = `context-cleanup:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    leader.store.initialize(leader.runtime)
    follower.store.initialize(follower.runtime)
    await follower.store.ingestContextMessage(observation({ ttlMs: 500 }))
    await vi.waitFor(() => expect(follower.store.registryState.active.sensor).toHaveLength(1))
    let mutations = 0
    leader.store.$subscribe(() => mutations++, { flush: 'sync' })

    await vi.waitFor(() => expect(follower.store.registryState.active).toEqual({}), { timeout: 3000 })
    expect(mutations).toBe(1)
    expect(follower.store.contextHistory).toHaveLength(1)
    leader.store.dispose()
    await follower.store.ingestContextMessage(observation({ id: 'after-disposal', ttlMs: 100 }))
    await new Promise(resolve => setTimeout(resolve, 2100))
    expect(leader.store.registryState.active.sensor).toHaveLength(1)
    expect(leader.store.getContextsSnapshot()).toEqual({})
  }, 10_000)

  it('preserves the checkpoint when a follower becomes the owner', async () => {
    const namespace = `context-promotion:${crypto.randomUUID()}`
    const leader = createWindow(namespace, 'leader-only')
    const follower = createWindow(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    leader.store.initialize(leader.runtime)
    follower.store.initialize(follower.runtime)
    const event = observation({ ttlMs: 60_000 })
    await leader.store.ingestContextMessage(event)
    await vi.waitFor(() => expect(follower.store.registryState.active.sensor).toHaveLength(1))
    const expiresAt = follower.store.registryState.active.sensor[0]!.expiresAt
    await leader.store.removeContextWriter('departed', 'before-promotion')
    await vi.waitFor(() => expect(follower.store.writerRemovalHistory).toHaveLength(1))
    leader.store.dispose()
    leader.runtime.dispose()
    await vi.waitFor(() => expect(follower.runtime.isLeader()).toBe(true))

    await follower.store.ingestContextMessage(observation({ id: 'next' }))
    expect(follower.store.contextHistory).toHaveLength(2)
    expect(follower.store.registryState.active.sensor[0]?.expiresAt).toBe(expiresAt)
    await follower.store.ingestContextMessage(event)
    expect(follower.store.contextHistory).toHaveLength(2)
    await follower.store.ingestContextMessage(observation({ id: 'returned', metadata: { source: { id: 'departed' } } }))
    expect(await follower.store.removeContextWriter('departed', 'before-promotion')).toBe(false)
    expect(follower.store.activeContexts.departed?.[0]?.id).toBe('returned')
    await follower.store.resetContexts()
    expect(follower.store.getContextsSnapshot()).toEqual({})
  })
})
