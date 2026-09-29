import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useVoiceSendStore } from './chat/voice-send'
import { useHearingDraftStore } from './hearing-drafts'

const contexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []
function context(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 2000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return { pinia, runtime, store: useHearingDraftStore(pinia) }
}

afterEach(() => {
  for (const { pinia, runtime } of contexts.splice(0)) {
    runtime.dispose()
    disposePinia(pinia)
  }
})

it('delivers a pending transcript to only one concurrent composer', async () => {
  const namespace = `hearing-drafts:${crypto.randomUUID()}`
  const leader = context(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = context(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  await follower.store.append('session-a', 'First phrase')
  await leader.store.append('session-a', 'Second phrase')
  await vi.waitFor(() => expect(follower.store.drafts['session-a']).toBe('First phrase\nSecond phrase'))
  const delivered = await Promise.all([leader.store.take('session-a'), follower.store.take('session-a')])
  expect(delivered.filter(Boolean)).toEqual(['First phrase\nSecond phrase'])
  await vi.waitFor(() => expect(follower.store.drafts['session-a']).toBeUndefined())
})

it('discards pending text when an existing session deletion event arrives', async () => {
  const leader = context(`hearing-drafts:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  await leader.store.append('deleted-session', 'Pending phrase')
  useVoiceSendStore(leader.pinia).discardSession('deleted-session')
  await vi.waitFor(() => expect(leader.store.drafts['deleted-session']).toBeUndefined())
})

it('keeps remote edits and review order on the leader and never revives a claimed draft', async () => {
  const namespace = `hearing-drafts:${crypto.randomUUID()}`
  const leader = context(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = context(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  await leader.store.append('session-a', 'First phrase')
  await follower.store.append('session-b', 'Second phrase')
  await follower.store.edit('session-a', 'Edited phrase')
  await follower.store.promote('session-a')
  await vi.waitFor(() => expect(leader.store.pendingSessionIds).toEqual(['session-b', 'session-a']))
  await vi.waitFor(() => expect(follower.store.drafts['session-a']).toBe('Edited phrase'))
  expect(await leader.store.take('session-a')).toBe('Edited phrase')
  await follower.store.edit('session-a', 'Late edit')
  await follower.store.promote('session-a')
  await vi.waitFor(() => expect(follower.store.pendingSessionIds).toEqual(['session-b']))
  expect(leader.store.drafts['session-a']).toBeUndefined()
  await follower.store.edit('session-b', '')
  expect(await leader.store.take('session-b')).toBe('')
  await vi.waitFor(() => expect(follower.store.pendingSessionIds).toEqual([]))
})
