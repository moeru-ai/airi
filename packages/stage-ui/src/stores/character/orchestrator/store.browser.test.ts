import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

import { useConsciousnessStore } from '../../modules/consciousness'
import { useCharacterNotebookStore } from '../notebook'
import { useCharacterOrchestratorStore } from './store'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: ref('en'), t: (key: string) => key, te: () => false }),
}))

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/server-sdk')>()
  return {
    ...original,
    Client: class {
      onEvent = vi.fn()
      offEvent = vi.fn()
      send = vi.fn()
      close = vi.fn()
    },
  }
})

const contexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
  orchestrator: ReturnType<typeof useCharacterOrchestratorStore>
}> = []

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = ''
  consciousness.activeModel = ''
  const orchestrator = useCharacterOrchestratorStore(pinia)
  orchestrator.attentionConfig.tickIntervalMs = 20
  const context = { pinia, runtime, orchestrator }
  contexts.push(context)
  return context
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.orchestrator.dispose()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
})

describe('orchestrator tick ownership', () => {
  // ROOT CAUSE:
  // Each renderer started its own interval. Followers processed local reminder queues.
  // The installed election runtime now owns ticker and event-consumer lifecycle.
  it('ticks only in the elected leader and starts after promotion', async () => {
    const namespace = `orchestrator:${crypto.randomUUID()}`
    const leader = createContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    const leaderNotebook = useCharacterNotebookStore(leader.pinia)
    const followerNotebook = useCharacterNotebookStore(follower.pinia)
    leaderNotebook.scheduleTask({ title: 'Leader reminder', dueAt: Date.now() })
    followerNotebook.scheduleTask({ title: 'Follower reminder', dueAt: Date.now() })

    leader.orchestrator.initialize(leader.runtime)
    follower.orchestrator.initialize(follower.runtime)
    follower.orchestrator.startTicker()
    await vi.waitFor(() => expect(leaderNotebook.tasks[0].lastNotifiedAt).toBeDefined())
    expect(followerNotebook.tasks[0].lastNotifiedAt).toBeUndefined()

    leader.orchestrator.dispose()
    leader.runtime.dispose()
    await vi.waitFor(() => expect(follower.runtime.isLeader()).toBe(true))
    await vi.waitFor(() => expect(followerNotebook.tasks[0].lastNotifiedAt).toBeDefined())
  })
})
