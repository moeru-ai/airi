import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia/setup-synced'

import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia/setup-synced'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useTamagotchiHomeAssistantStore } from './home-assistant'

// The renderer reaches the main process through these, and no call here needs it.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: () => vi.fn(async () => ({ baseUrl: '', hasToken: false, tokenPreview: '' })),
}))

type SyncedRuntime = ReturnType<typeof usePiniaSynced>
const windows: Array<{ app: ReturnType<typeof createApp>, pinia: ReturnType<typeof createPinia> }> = []

/**
 * Opens one renderer window over the synchronization runtime of the application.
 *
 * A component reads the runtime, which is how every window of the application
 * receives it.
 */
function openWindow(leadership: LeadershipMode) {
  const plugins = setupSynced({ leadership })
  const pinia = createPinia()
  pinia.use(plugins.pinia)
  let runtime: SyncedRuntime | undefined
  const app = createApp({
    setup() {
      runtime = usePiniaSynced()
      return () => null
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.use(pinia)
  app.use(plugins.vue)
  app.mount(host)
  windows.push({ app, pinia })

  return { pinia, runtime: runtime as SyncedRuntime }
}

describe('tamagotchiHomeAssistantStore', () => {
  afterEach(() => {
    for (const window of windows.splice(0)) {
      window.app.unmount()
      disposePinia(window.pinia)
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
    const leader = openWindow('leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    const leaderPolicy = useHomeAssistantStore()
    useTamagotchiHomeAssistantStore()

    const follower = openWindow('follower-only')
    setActivePinia(follower.pinia)
    const followerPolicy = useHomeAssistantStore()
    const followerTools = useTamagotchiHomeAssistantStore()
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))

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
