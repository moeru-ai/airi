import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSpeechStore } from './speech'

const syncedContexts: Array<{
  app: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

/** Creates one mounted speech-store renderer with explicit leadership. */
function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)

  let speechStore: ReturnType<typeof useSpeechStore> | undefined
  const app = createApp({
    setup() {
      speechStore = useSpeechStore()
      return () => null
    },
  })
  app
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .mount(document.createElement('div'))

  if (!speechStore)
    throw new Error('Speech store did not initialize')

  syncedContexts.push({ app, pinia, runtime })
  return { pinia, runtime, speechStore }
}

describe('speech synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.app.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3959813206
  // ROOT CAUSE:
  //
  // Each renderer ran the speech watcher and changed a state-synchronized
  // store after its local voice request completed. A follower then proposed
  // its full snapshot and could overwrite newer leader state.
  //
  // Before: a follower executed loadVoicesForProvider locally and published a
  // replaceState proposal.
  //
  // We fixed this by routing the action to the synchronization leader. The
  // leader publishes the result, and the follower only applies that snapshot.
  it('routes voice catalog loading through the leader', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await new Promise(resolve => setTimeout(resolve, 50))

    let leaderLoads = 0
    leaderContext.speechStore.$onAction(({ name }) => {
      if (name === 'loadVoicesForProvider')
        leaderLoads++
    })
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    await followerContext.speechStore.loadVoicesForProvider('speech-noop')

    expect(leaderLoads).toBe(1)
    const proposals = traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))
    expect(proposals).toHaveLength(0)
  })
})
