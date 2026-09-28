import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { chatSessionsRepo } from '../../database/repos/chat-sessions.repo'
import { storage } from '../../database/storage'
import { useChatSessionStore } from '../chat/session-store'
import { useProviderConfigStore } from '../providers/config'
import { useSettingsStageModel } from '../settings/stage-model'
import { useAiriCardStore } from './airi-card'
import { useArtistryStore } from './artistry'
import { useArtistrySettingsStore } from './artistry-settings'
import { useConsciousnessStore } from './consciousness'
import { useConsciousnessSettingsStore } from './consciousness-settings'
import { useSpeechStore } from './speech'

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
  it('shares one account index read across concurrent character hydration for PR #2672', async () => {
    const context = createContext()
    await context.cards.initialize()
    const second = await context.cards.addCard({ ...context.cards.activeCard!, name: 'Second' }, 'scratch')
    const chats = useChatSessionStore(context.pinia)
    const gate = Promise.withResolvers<null>()
    const read = vi.spyOn(chatSessionsRepo, 'getIndex').mockReturnValue(gate.promise)
    const firstSession = chats.ensureCharacterSession('default')
    const secondSession = chats.ensureCharacterSession(second)
    await nextTick()
    expect(read).toHaveBeenCalledTimes(1)
    gate.resolve(null)
    const [firstId, secondId] = await Promise.all([firstSession, secondSession])
    expect(chats.sessionMetas[firstId].characterId).toBe('default')
    expect(chats.sessionMetas[secondId].characterId).toBe(second)
    const archive = await chats.exportSessions()
    expect(archive.index.characters.default.sessions[firstId].characterId).toBe('default')
    expect(archive.index.characters[second].sessions[secondId].characterId).toBe(second)
  })

  it('clears the old conversation synchronously when selecting another role for PR #2672', async () => {
    const context = createContext()
    await context.cards.initialize()
    const chats = useChatSessionStore(context.pinia)
    await chats.initialize()
    const previous = chats.activeSessionId
    const second = await context.cards.addCard({ ...context.cards.activeCard!, name: 'Second' }, 'scratch')
    context.cards.activeCardId = second
    expect(chats.activeSessionId).not.toBe(previous)
    await expect.poll(() => chats.sessionMetas[chats.activeSessionId]?.characterId).toBe(second)
  })

  it('keeps unavailable authenticated card providers out of inference for PR #2672', async () => {
    const context = createContext()
    await context.cards.initialize()
    const providerConfig = useProviderConfigStore(context.pinia)
    await providerConfig.ensureProvider('official-provider', 'official-provider')
    await providerConfig.updateProviderConfig('official-provider', {}, 'unconfigured')
    await context.cards.updateActiveCardConsciousness({ provider: 'official-provider', model: 'disabled' })
    await context.cards.updateActiveCardVision({ provider: 'official-provider', model: 'disabled' })
    const character = context.cards.resolveCharacter('default')
    expect(character.modules.consciousness.provider).toBe('')
    expect(character.modules.vision.provider).toBe('')
    expect(context.cards.activeCard?.extensions.airi.modules.consciousness.provider).toBe('official-provider')
  })

  it('shares global sampling and artistry settings without changing local role overrides for PR #2672', async () => {
    const namespace = `globals-${crypto.randomUUID()}`
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    await leader.cards.initialize()
    const leaderArtistry = useArtistryStore(leader.pinia)
    const leaderSampling = useConsciousnessSettingsStore(leader.pinia)
    const follower = createContext(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))
    await expect.poll(() => follower.cards.cards.has('default')).toBe(true)
    await follower.cards.initialize()
    const followerSampling = useConsciousnessSettingsStore(follower.pinia)
    const followerSettings = useArtistrySettingsStore(follower.pinia)
    const persisted = vi.spyOn(Storage.prototype, 'setItem')
    await followerSampling.setTemperature(0.2)
    await followerSampling.setTopP(0.6)
    await followerSettings.setGlobalProvider('replicate')
    await followerSettings.setReplicateApiKey('test-only-key')
    expect(leaderSampling.temperature).toBe(0.2)
    expect(leaderSampling.topP).toBe(0.6)
    await expect.poll(() => leaderArtistry.replicateApiKey).toBe('test-only-key')
    expect(leaderArtistry.globalProvider).toBe('replicate')
    expect(localStorage.getItem('artistry-replicate-api-key')).toBe('test-only-key')
    await nextTick()
    expect(persisted.mock.calls.filter(([key]) => key === 'artistry-replicate-api-key')).toHaveLength(1)
    const card = follower.cards.activeCard!
    const id = await follower.cards.addCard({ ...card, name: 'Painter', extensions: { ...card.extensions, airi: { ...card.extensions.airi, modules: { ...card.extensions.airi.modules, artistry: { ...card.extensions.airi.modules.artistry, provider: 'comfyui' } } } } }, 'scratch')
    await follower.cards.activateCard(id)
    await followerSettings.setGlobalProvider('nanobanana')
    await expect.poll(() => leaderArtistry.activeProvider).toBe('nanobanana')
    expect(useArtistryStore(follower.pinia).activeProvider).toBe('comfyui')
    expect(leader.cards.activeCardId).toBe('default')
  })

  it('captures speech for the requested role instead of the active runtime for PR #2672', async () => {
    const context = createContext()
    const speech = useSpeechStore(context.pinia)
    speech.activeSpeechProvider = 'speech-noop'
    speech.activeSpeechModel = 'leader-model'
    const captured = await speech.resolveSpeechSelection({ provider: 'openai-compatible-audio-speech', model: 'tts-1', voice_id: 'nova', pitch: 10, ssml: true })
    speech.activeSpeechModel = 'changed-later'
    expect(captured.provider).toBe('openai-compatible-audio-speech')
    expect(captured.model).toBe('tts-1')
    expect(captured.voice?.id).toBe('nova')
    expect(captured.pitch).toBe(10)
    expect(captured.ssmlEnabled).toBe(true)
    expect(speech.activeSpeechProvider).toBe('speech-noop')
  })

  it('resolves autonomous artistry from the conversation character for PR #2672', async () => {
    const context = createContext()
    await context.cards.initialize()
    const globals = useArtistrySettingsStore(context.pinia)
    await globals.setGlobalProvider('replicate')
    await globals.setGlobalModel('global-model')
    await globals.setGlobalProviderOptions({ globalOnly: true })
    const original = context.cards.activeCard!
    const second = await context.cards.addCard({
      ...original,
      name: 'Artist',
      extensions: { ...original.extensions, airi: { ...original.extensions.airi, modules: { ...original.extensions.airi.modules, consciousness: { provider: 'ollama', model: 'director-model' }, artistry: { ...original.extensions.airi.modules.artistry, provider: 'comfyui', model: 'workflow-model', autonomousEnabled: true, autonomousTarget: 'assistant' } } } },
    }, 'scratch')
    const resolved = context.cards.resolveCharacter(second)
    expect(context.cards.activeCardId).toBe('default')
    expect(resolved.modules.consciousness.model).toBe('director-model')
    expect(resolved.modules.artistry.provider).toBe('comfyui')
    expect(resolved.modules.artistry.model).toBe('workflow-model')
    expect(resolved.modules.artistry.autonomousEnabled).toBe(true)
    expect(resolved.modules.artistry.autonomousTarget).toBe('assistant')
    expect(resolved.modules.artistry.options).toBeUndefined()
  })

  it('retains inherited runtime changes before saving an explicit override for PR #2672', async () => {
    const context = createContext()
    context.consciousness.activeProvider = 'ollama'
    context.consciousness.activeModel = 'original'
    await context.cards.initialize()
    context.consciousness.activeModel = 'changed'
    await context.cards.updateActiveCardConsciousness({ provider: 'ollama', model: 'changed' })
    expect(context.cards.moduleDefaults?.consciousness.model).toBe('changed')
  })

  it('does not restore catalog defaults from a reset snapshot for PR #2672', async () => {
    const namespace = `reset-${crypto.randomUUID()}`
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    await leader.cards.initialize()
    const follower = createContext(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))
    await expect.poll(() => follower.cards.cards.has('default')).toBe(true)
    await follower.cards.initialize()
    await follower.cards.resetState()
    await nextTick()
    expect(leader.cards.moduleDefaults).toBeNull()
    expect(follower.cards.moduleDefaults).toBeNull()
    expect(leader.cards.cards.size).toBe(0)
  })

  it('deletes the last retained session of a removed character for PR #2672', async () => {
    const context = createContext()
    await context.cards.initialize()
    const chats = useChatSessionStore(context.pinia)
    await chats.initialize()
    const id = await context.cards.addCard({ ...context.cards.activeCard!, name: 'Disposable' }, 'scratch')
    const session = await chats.createSession(id)
    await context.cards.removeCard(id)
    await expect(chats.deleteSession(session)).resolves.toBeUndefined()
    expect(Object.values(chats.sessionMetas).some(meta => meta.characterId === id)).toBe(false)
  })

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

  it('repairs the importing follower selection without navigating the leader for PR #2672', async () => {
    const namespace = `import-${crypto.randomUUID()}`
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    await leader.cards.initialize()
    const leaderChats = useChatSessionStore(leader.pinia)
    await leaderChats.initialize()
    const archive = await leaderChats.exportSessions()
    const second = await leader.cards.addCard({ ...leader.cards.activeCard!, name: 'Second' }, 'scratch')
    const follower = createContext(createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' }))
    await expect.poll(() => follower.cards.cards.has(second)).toBe(true)
    await follower.cards.initialize()
    const followerChats = useChatSessionStore(follower.pinia)
    await followerChats.initialize()
    await follower.cards.activateCard(second)
    await expect.poll(() => followerChats.sessionMetas[followerChats.activeSessionId]?.characterId).toBe(second)
    const oldSession = followerChats.activeSessionId
    await followerChats.importSessions(archive)
    expect(followerChats.activeSessionId).not.toBe(oldSession)
    expect(followerChats.sessionMetas[followerChats.activeSessionId].characterId).toBe(second)
    expect(leaderChats.sessionMetas[leaderChats.activeSessionId].characterId).toBe('default')
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
    await expect.poll(() => followerChats.sessionMetas[retainedSessionId]).toBeUndefined()
  })

  beforeEach(async () => {
    localStorage.clear()
    await storage.clear('local')
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
    await cards.initialize()
    expect(cards.moduleDefaults?.consciousness.provider).toBe('ollama')
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
