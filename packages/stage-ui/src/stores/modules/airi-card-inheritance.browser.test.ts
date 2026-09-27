import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { useChatSessionStore } from '../chat/session-store'
import { useSettingsStageModel } from '../settings/stage-model'
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
  it('binds an inactive card without navigating and restores its model when selected', async () => {
    const context = createContext()
    await context.cards.initialize()
    const originalModel = context.cards.currentModels.displayModelId
    const cardId = await context.cards.addCard({ ...context.cards.activeCard!, name: 'Luna' }, 'scratch')

    expect(await context.cards.updateCardDisplayModel(cardId, 'preset-vrm-1')).toBe(true)
    expect(context.cards.activeCardId).toBe('default')
    expect(context.cards.currentModels.displayModelId).toBe(originalModel)
    expect(context.cards.getCard(cardId)?.extensions.airi.modules.displayModelId).toBe('preset-vrm-1')

    await context.cards.activateCard(cardId)
    expect(context.cards.currentModels.displayModelId).toBe('preset-vrm-1')
    await context.cards.activateCard('default')
    expect(context.cards.currentModels.displayModelId).toBe(originalModel)

    await context.cards.updateCardDisplayModel(cardId, undefined)
    expect(context.cards.getCard(cardId)?.extensions.airi.modules.displayModelId).toBeUndefined()
    expect(context.cards.activeCardId).toBe('default')
    expect(await context.cards.updateCardDisplayModel('deleted-card', 'preset-vrm-1')).toBe(false)
  })

  it('keeps character selection and effective configuration local to each window', async () => {
    const namespace = `character-windows-${crypto.randomUUID()}`
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    leader.consciousness.activeProvider = 'ollama'
    leader.consciousness.activeModel = 'global-model'
    await leader.cards.initialize()
    const cardId = await leader.cards.addCard({
      ...leader.cards.activeCard!,
      name: 'Independent character',
      description: 'Independent prompt',
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: { provider: 'ollama', model: 'character-model' },
            vision: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
            displayModelId: 'preset-vrm-1',
          },
        },
      },
    }, 'scratch')
    const followerRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' })
    const follower = createContext(followerRuntime)
    await expect.poll(() => follower.cards.cards.has(cardId)).toBe(true)
    await follower.cards.initialize()
    await follower.cards.activateCard(cardId)
    expect(follower.cards.activeCardId).toBe(cardId)
    expect(leader.cards.activeCardId).toBe('default')
    expect(follower.consciousness.activeModel).toBe('character-model')
    expect(leader.consciousness.activeModel).toBe('global-model')
    expect(follower.cards.currentModels.displayModelId).toBe('preset-vrm-1')
    expect(leader.cards.currentModels.displayModelId).toBe('preset-live2d-1')

    const leaderChats = useChatSessionStore(leader.pinia)
    const followerChats = useChatSessionStore(follower.pinia)
    await leaderChats.initialize()
    await followerChats.initialize()
    const leaderSessionId = leaderChats.activeSessionId
    const followerSessionId = followerChats.activeSessionId
    expect(leaderChats.sessionMetas[leaderSessionId].characterId).toBe('default')
    expect(followerChats.sessionMetas[followerSessionId].characterId).toBe(cardId)
    expect(followerChats.messages[0].content).toContain('Independent prompt')
    expect(leaderChats.messages[0].content).not.toContain('Independent prompt')

    const anotherSessionId = await followerChats.createSession(cardId)
    expect(followerChats.activeSessionId).toBe(anotherSessionId)
    expect(leaderChats.activeSessionId).toBe(leaderSessionId)
    await follower.cards.activateCard('default')
    await expect.poll(() => followerChats.sessionMetas[followerChats.activeSessionId]?.characterId).toBe('default')
    await followerChats.setActiveSession(followerSessionId)
    expect(follower.cards.activeCardId).toBe(cardId)
    expect(follower.cards.currentModels.displayModelId).toBe('preset-vrm-1')
    expect(leader.cards.activeCardId).toBe('default')
    expect(leaderChats.activeSessionId).toBe(leaderSessionId)
    await followerChats.resetAllSessions()
    await expect.poll(() => leaderChats.sessionMetas[leaderChats.activeSessionId]?.characterId).toBe('default')
    await expect.poll(() => followerChats.sessionMetas[followerChats.activeSessionId]?.characterId).toBe(cardId)
    const retainedSessionId = followerChats.activeSessionId
    await follower.cards.removeCard(cardId)
    await expect.poll(() => follower.cards.activeCardId).toBe('default')
    await expect.poll(() => followerChats.sessionMetas[followerChats.activeSessionId]?.characterId).toBe('default')
    expect(followerChats.sessionMetas[retainedSessionId].characterId).toBe(cardId)
  })

  beforeEach(() => {
    localStorage.clear()
    const fetchAsset = globalThis.fetch.bind(globalThis)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href)
      if (url.origin === location.origin)
        return fetchAsset(input, init)
      return new Response(JSON.stringify({ voices: [], recommended: {}, data: [] }))
    }))
  })

  afterEach(async () => {
    for (const pinia of piniaInstances)
      await useSettingsStageModel(pinia).updateStageModel()
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
    await follower.cards.initialize()
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
    expect(leader.consciousness.activeModel).toBe('card-model')
    expect(follower.cards.activeCardId).toBe('default')
    expect(follower.consciousness.activeModel).toBe('global-model')
    await leader.cards.activateCard('default')
    await expect.poll(() => follower.consciousness.activeModel).toBe('global-model')
    expect(follower.cards.moduleDefaults?.consciousness.model).toBe('global-model')
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })
})
