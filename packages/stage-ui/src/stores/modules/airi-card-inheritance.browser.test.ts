import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { useAiriCardStore } from './airi-card'
import { useConsciousnessStore } from './consciousness'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }),
}))

const runtimes: SyncedPiniaRuntime[] = []
const piniaInstances: ReturnType<typeof createPinia>[] = []

function createContext(runtime?: SyncedPiniaRuntime) {
  const pinia = createPinia()
  if (runtime) {
    runtimes.push(runtime)
    pinia.use(runtime.plugin)
  }
  createApp({}).use(pinia).use(PiniaColada)
  setActivePinia(pinia)
  piniaInstances.push(pinia)
  return { pinia, cards: useAiriCardStore(pinia), consciousness: useConsciousnessStore(pinia) }
}

describe('persisted and replicated card defaults', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ voices: [], recommended: {}, data: [] }))))
  })

  afterEach(() => {
    for (const runtime of runtimes.splice(0))
      runtime.dispose()
    for (const pinia of piniaInstances.splice(0))
      disposePinia(pinia)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2332
  // ROOT CAUSE:
  // A null storage default selects VueUse's string serializer. After reload,
  // the editor received text instead of module settings. Specify JSON storage.
  it('reads saved defaults as settings after a reload', async () => {
    localStorage.setItem('airi-card-module-defaults', JSON.stringify({
      consciousness: { provider: 'ollama', model: 'global-model' },
      vision: { provider: '', model: '' },
      speech: { provider: 'speech-noop', model: '', voice_id: '' },
      displayModelId: 'preset-live2d-1',
    }))
    const { cards, consciousness } = createContext()
    expect(cards.moduleDefaults?.consciousness.provider).toBe('ollama')
    await cards.initialize()
    expect(consciousness.activeModel).toBe('global-model')
  })

  it('does not publish a follower state proposal after a card snapshot', async () => {
    const namespace = `card-inheritance-${crypto.randomUUID()}`
    const onError = vi.fn()
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only', onError })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    leader.consciousness.activeProvider = 'ollama'
    leader.consciousness.activeModel = 'global-model'
    await leader.cards.initialize()

    const followerRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only', onError })
    const follower = createContext(followerRuntime)
    await expect.poll(() => follower.cards.moduleDefaults?.consciousness.model).toBe('global-model')
    await expect.poll(() => follower.consciousness.activeModel).toBe('global-model')
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await leader.cards.updateCard('default', {
      ...leader.cards.activeCard!,
      description: 'Changed in another window',
    })
    await expect.poll(() => follower.cards.activeCard?.description).toBe('Changed in another window')
    await nextTick()
    expect(follower.consciousness.activeModel).toBe('global-model')
    // replaceState is the plugin's follower-to-leader proposal RPC. A received
    // snapshot must not call it, even when Vue watchers observe that snapshot.
    const proposals = traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))
    expect(proposals).toHaveLength(0)

    const explicit = await leader.cards.addCard({
      ...leader.cards.activeCard!,
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: { provider: 'another-provider', model: 'card-model' },
            vision: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
          },
        },
      },
    }, 'import')
    await leader.cards.activateCard(explicit)
    await expect.poll(() => follower.consciousness.activeModel).toBe('card-model')
    await leader.cards.activateCard('default')
    await expect.poll(() => follower.consciousness.activeModel).toBe('global-model')
    expect(follower.cards.moduleDefaults?.consciousness.model).toBe('global-model')
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })
})
