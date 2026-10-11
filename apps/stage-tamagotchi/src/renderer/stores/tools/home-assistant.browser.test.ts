import type { LeadershipMode } from '@proj-airi/stage-ui/libs/pinia/setup-synced'

import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia/setup-synced'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useTamagotchiHomeAssistantStore } from './home-assistant'

/** The config the main process holds, which every case states for itself. */
const emptyConfig = { baseUrl: '', hasToken: false, tokenPreview: '' }

const invokeMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
}))

// The renderer reaches the main process through these, and no call here needs it.
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: () => invokeMocks.getConfig,
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
  beforeEach(() => {
    invokeMocks.getConfig.mockReset()
    invokeMocks.getConfig.mockResolvedValue(emptyConfig)
  })

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

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4242298226
  it('keeps the tools mounted while a refresh reads the config (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // `refresh` unmounted every Home Assistant tool before it read the config and
    // built the replacements. A model request that resolved its tools inside those
    // awaits found none, so one turn lost the integration in silence.
    //
    // The replacements are built before the swap now.
    const usable = { baseUrl: 'http://home-a.local:8123', hasToken: true, tokenPreview: 'eyJhbGciOi…8f2a' }
    invokeMocks.getConfig.mockResolvedValue(usable)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    const leader = openWindow('leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    setActivePinia(leader.pinia)
    useHomeAssistantStore().enabled = true
    const tools = useTamagotchiHomeAssistantStore()
    const mounted = () => useLlmToolsStore().tools.filter(tool => tool.id.startsWith('home-assistant:'))

    await tools.refresh()
    await vi.waitFor(() => expect(mounted().length).toBeGreaterThan(0))
    const count = mounted().length

    // A later refresh holds its config read open, which is the window a model
    // request reads in.
    invokeMocks.getConfig.mockImplementation(async () => {
      await held
      return usable
    })
    const second = tools.refresh()
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(mounted().length).toBe(count)

    // The run finishes before the window closes, so the teardown has no call in
    // flight to reject.
    release()
    await second
  })
})
