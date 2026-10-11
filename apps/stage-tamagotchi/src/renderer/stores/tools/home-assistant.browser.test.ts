import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTamagotchiHomeAssistantStore } from './home-assistant'

// The renderer reaches the main process through these, and no call here needs it.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: () => vi.fn(async () => ({ baseUrl: '', hasToken: false, tokenPreview: '' })),
}))

const contexts: Array<{ pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  contexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('tamagotchiHomeAssistantStore', () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241734042
  it('publishes the policy of the settings window into the leader (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The settings window is follower-only, so `setPolicy` travels to the leader over
    // a BroadcastChannel. Every test of the page replaced that action with a spy, so
    // the real action had no coverage across windows.
    //
    // This test runs the real action between two windows.
    const namespace = `home-assistant-tools:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    const leaderPolicy = useHomeAssistantStore()
    useTamagotchiHomeAssistantStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerPolicy = useHomeAssistantStore()
    const followerTools = useTamagotchiHomeAssistantStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    await followerTools.setPolicy('deny', [], ['lock.front_door'])

    // The leader holds the rule the picker published, in the order the action names
    // its arguments.
    expect(leaderPolicy.exposureMode).toBe('deny')
    expect(leaderPolicy.deniedEntities).toEqual(['lock.front_door'])
    expect(leaderPolicy.allowedEntities).toEqual([])
    // The picker keeps its own copy, and the two windows agree.
    await vi.waitFor(() => expect(followerPolicy.exposureMode).toBe('deny'))
    expect(followerPolicy.deniedEntities).toEqual(['lock.front_door'])
  })
})
