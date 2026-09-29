import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useVoiceInlayStore } from './voice-inlay'

const contexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function context(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 1000 })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('voice inlay cross-window state', () => {
  afterEach(() => {
    for (const item of contexts.splice(0)) {
      item.runtime.dispose()
      disposePinia(item.pinia)
    }
  })

  it('replicates the pending stack once without a follower echo', async () => {
    const namespace = `voice-inlay:${crypto.randomUUID()}`
    const leader = context(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderStore = useVoiceInlayStore()

    const follower = context(namespace, 'follower-only')
    setActivePinia(follower.pinia)
    const followerStore = useVoiceInlayStore()
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))

    let leaderMutations = 0
    let followerMutations = 0
    let followerActions = 0
    leaderStore.$subscribe(() => leaderMutations++, { flush: 'sync' })
    followerStore.$subscribe(() => followerMutations++, { flush: 'sync' })
    followerStore.$onAction(() => followerActions++)

    leaderStore.queueVoiceDraft({ cardId: 'a', sessionId: 'session-a', text: 'hello' })
    await vi.waitFor(() => expect(followerStore.activeDraft?.text).toBe('hello'))
    leaderStore.beginDraftTranscription('session-a')
    await vi.waitFor(() => expect(followerStore.transcribingSessionId).toBe('session-a'))
    leaderStore.editVoiceDraft('session-a', 'hello world')
    await vi.waitFor(() => expect(followerStore.activeDraft?.text).toBe('hello world'))
    leaderStore.finishDraftTranscription('session-a')
    await vi.waitFor(() => expect(followerStore.transcribingSessionId).toBeUndefined())
    const leaderMutationsAfterSync = leaderMutations
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(leaderStore.activeDraft).toEqual(followerStore.activeDraft)
    expect(leaderStore.pendingSessionIds).toEqual(['session-a'])
    expect(leaderMutations).toBe(leaderMutationsAfterSync)
    expect(followerMutations).toBeGreaterThan(0)
    expect(followerActions).toBe(0)
  })
})
