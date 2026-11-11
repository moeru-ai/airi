import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useConsciousnessStore } from './consciousness'
import { useVisionStore } from './vision'

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
  //
  // The module stores now hold the defaults. Before that, they held the selection of the active character,
  // and this snapshot held the defaults. The first start moves the snapshot into the module stores.
  it('moves the saved defaults of an earlier version into the module stores', async () => {
    localStorage.setItem('settings/consciousness/active-provider', 'ollama')
    localStorage.setItem('settings/consciousness/active-model', 'model-of-the-active-character')
    localStorage.setItem('airi-card-module-defaults', JSON.stringify({
      consciousness: { provider: 'ollama', model: 'global-model' },
      vision: { provider: '', model: '' },
      speech: { provider: 'speech-noop', model: '', voice_id: '' },
      displayModelId: 'preset-live2d-1',
    }))
    const { cards, consciousness } = createContext()
    await cards.initialize()
    expect(consciousness.activeProvider).toBe('ollama')
    expect(consciousness.activeModel).toBe('global-model')
    expect(cards.moduleDefaults.consciousness).toEqual({ provider: 'ollama', model: 'global-model' })
    expect(localStorage.getItem('airi-card-module-defaults')).toBeNull()
  })

  it('stores the catalog default when a follower selects a vision provider', async () => {
    // ROOT CAUSE:
    //
    // Selecting a vision provider stored an empty model on the card before the
    // catalog loaded, so applying the card again restored the empty model.
    //
    // We fixed this with a leader command that stores the catalog default.
    // The command is now on the vision store, which holds the default.
    const namespace = `card-vision-${crypto.randomUUID()}`
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    await leader.cards.initialize()
    // The browser test has no Electron addon, so the leader holds the catalog state.
    useProviderStore(leader.pinia).providerRuntimeState = {
      'apple-vision': { models: [], defaultModel: 'system', modelStatus: 'ready', modelError: null },
    }

    const followerRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' })
    const follower = createContext(followerRuntime)
    await expect.poll(() => follower.cards.activeCard).toBeDefined()

    await useVisionStore(follower.pinia).selectProvider('apple-vision')

    await expect.poll(() => useVisionStore(leader.pinia).activeProvider).toBe('apple-vision')
    await expect.poll(() => useVisionStore(leader.pinia).activeModel).toBe('system')
    await expect.poll(() => useVisionStore(follower.pinia).activeModel).toBe('system')
    expect(leader.cards.activeCard?.extensions.airi.modules.vision).toEqual({ provider: '', model: '' })
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
    await expect.poll(() => follower.cards.activeCardId).toBe(explicit)
    expect(follower.cards.getModules(explicit).consciousness).toEqual({ provider: 'another-provider', model: 'card-model' })
    expect(follower.consciousness.activeModel).toBe('global-model')
    await leader.cards.activateCard('default')
    await expect.poll(() => follower.cards.activeCardId).toBe('default')
    expect(follower.consciousness.activeModel).toBe('global-model')
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })
})
