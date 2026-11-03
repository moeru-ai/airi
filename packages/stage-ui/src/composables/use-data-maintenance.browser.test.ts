import type { LeadershipMode } from 'pinia-plugin-synced'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, toRaw } from 'vue'
import { createI18n } from 'vue-i18n'

import { injectKeyPiniaSynced } from '../libs/pinia/synced-context'
import { toStoredVoiceprint } from '../libs/voice/voiceprint'
import { useDisplayModelsStore } from '../stores/display-models'
import { useMemoryStore } from '../stores/memory'
import { useModsServerChannelStore } from '../stores/mods/api/channel-server'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useConsciousnessSettingsStore } from '../stores/modules/consciousness-settings'
import { useDiscordStore } from '../stores/modules/discord'
import { useFactorioStore } from '../stores/modules/gaming-factorio'
import { useMinecraftStore } from '../stores/modules/gaming-minecraft'
import { useHearingStore } from '../stores/modules/hearing'
import { useHomeAssistantStore } from '../stores/modules/home-assistant'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useVisionStore } from '../stores/modules/vision'
import { useWebSearchStore } from '../stores/modules/web-search'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useRecipesStore } from '../stores/recipes'
import { useVoiceprintStore } from '../stores/voiceprint'
import { useDataMaintenance } from './use-data-maintenance'

// Keep the model runtime outside this store regression. Voice selection needs no model download.
vi.mock('../libs/inference/adapters/kokoro', () => ({
  getKokoroAdapter: async () => ({
    state: 'ready',
    loadModel: vi.fn(async () => undefined),
    getVoices: () => ({ af_heart: { language: 'en-us', name: 'Heart', gender: 'Female' } }),
  }),
}))

const cleanups: Array<() => void> = []

/** Mounts the maintenance composable with real stores and a separate synchronization runtime. */
function mountMaintenance(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  // https://github.com/moeru-ai/airi/pull/2477
  // ROOT CAUSE:
  // Maintenance initializes the module channel. A local server can send events
  // after this test destroys Pinia. Isolate the transport and close it before teardown.
  const channel = useModsServerChannelStore(pinia)
  void channel.initialize({ connector: () => ({
    connect: () => ({ send: vi.fn(), close: vi.fn() }),
  }) })
  let maintenance: ReturnType<typeof useDataMaintenance> | undefined
  const app = createApp({
    setup() {
      maintenance = useDataMaintenance()
      return () => null
    },
  })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
    .use(PiniaColada)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    channel.dispose()
    disposePinia(pinia)
    runtime.dispose()
  })
  if (!maintenance)
    throw new Error('Maintenance composable did not initialize')
  return { pinia, runtime, maintenance }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/issues/3154
// ROOT CAUSE:
// Reset removed provider settings but kept module defaults and card overrides.
// Clear unavailable selections in leader actions, including inactive cards, without changing consciousness.
it.each(['leader-only', 'follower-only'] as const)('clears unavailable module providers on every card from %s (Issue #3154)', async (leadership) => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [], data: [] })))
  const namespace = `maintenance:${crypto.randomUUID()}`
  const leader = mountMaintenance(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const { pinia } = leader
  const providers = useProviderConfigStore(pinia)
  for (const definitionId of ['openai', 'openai-audio-speech', 'openai-audio-transcription']) {
    providers.providers[definitionId] = {
      id: definitionId,
      definitionId,
      config: { apiKey: 'test-key' },
      status: 'configured',
      configuredBy: 'user',
    }
  }
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'chat-model'
  const vision = useVisionStore(pinia)
  vision.activeProvider = 'vision-openai'
  vision.activeModel = 'vision-model'
  vision.customModelName = 'custom-vision-model'
  const speech = useSpeechStore(pinia)
  await speech.selectProviderModel('openai-audio-speech', 'tts-1', 'alloy')
  speech.pitch = 2
  const hearing = useHearingStore(pinia)
  hearing.activeTranscriptionProvider = 'openai-audio-transcription'
  hearing.activeTranscriptionModel = 'whisper-1'
  hearing.activeCustomModelName = 'custom-transcription-model'
  hearing.autoSendDelay = 1234
  const cards = useAiriCardStore(pinia)
  await cards.initialize()
  const inheritedId = await cards.addCard(structuredClone(toRaw(cards.activeCard!)), 'duplicate')
  const partial = structuredClone(toRaw(cards.activeCard!))
  partial.extensions.airi.modules.vision.model = 'card-vision-model'
  partial.extensions.airi.modules.speech.model = 'tts-1'
  partial.extensions.airi.modules.speech.voice_id = 'echo'
  const partialId = await cards.addCard(partial, 'duplicate')
  const explicit = structuredClone(toRaw(cards.activeCard!))
  explicit.extensions.airi.modules = {
    ...explicit.extensions.airi.modules,
    consciousness: { provider: 'openai', model: 'card-chat-model' },
    vision: { provider: 'vision-openai', model: 'card-vision-model' },
    speech: { provider: 'openai-audio-speech', model: 'tts-1', voice_id: 'echo' },
  }
  const inactiveId = await cards.addCard(explicit, 'duplicate')
  const activeId = await cards.addCard(explicit, 'duplicate')
  await cards.activateCard(activeId)
  const caller = leadership === 'leader-only' ? leader : mountMaintenance(namespace, leadership)
  await vi.waitFor(() => expect(caller.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  await vi.waitFor(() => expect(useAiriCardStore(caller.pinia).activeCardId).toBe(activeId))
  const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

  await caller.maintenance.resetProvidersSettings()

  expect(providers.providers.openai).toBeUndefined()
  expect(vision.activeProvider).toBe('')
  expect(vision.activeModel).toBe('')
  expect(vision.customModelName).toBe('')
  expect(speech.activeSpeechProvider).toBe('speech-noop')
  expect(speech.activeSpeechModel).toBe('')
  expect(speech.activeSpeechVoiceId).toBe('')
  expect(hearing.activeTranscriptionProvider).toBe('')
  expect(hearing.activeTranscriptionModel).toBe('')
  expect(hearing.activeCustomModelName).toBe('')
  expect(hearing.autoSendDelay).toBe(1234)
  expect(speech.pitch).toBe(2)
  expect(consciousness.activeProvider).toBe('openai')
  expect(consciousness.activeModel).toBe('card-chat-model')
  expect(cards.moduleDefaults?.consciousness).toEqual({ provider: 'openai', model: 'chat-model' })
  for (const id of [activeId, inactiveId, inheritedId, partialId]) {
    expect(cards.getModules(id)?.vision).toEqual({ provider: '', model: '' })
    expect(cards.getModules(id)?.speech).toEqual({ provider: 'speech-noop', model: '', voice_id: '' })
  }
  expect(cards.getCard(inactiveId)?.extensions.airi.modules.consciousness).toEqual({ provider: 'openai', model: 'card-chat-model' })
  expect(cards.getCard(partialId)?.extensions.airi.modules.speech).toEqual({ provider: '', model: '', voice_id: '' })
  await cards.activateCard(inactiveId)
  expect(speech.activeSpeechProvider).toBe('speech-noop')
  await cards.activateCard(inheritedId)
  expect(vision.activeProvider).toBe('')
  expect(consciousness.activeModel).toBe('chat-model')
  await vi.waitFor(() => expect(useHearingStore(caller.pinia).activeTranscriptionProvider).toBe(''))
  await vi.waitFor(() => expect(useSpeechStore(caller.pinia).activeSpeechProvider).toBe('speech-noop'))
  await nextTick()
  expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
})

// https://github.com/moeru-ai/airi/issues/3154
// ROOT CAUSE:
// Clearing every selection also removes usable local providers. Clear only providers that need removed settings.
// An unavailable explicit override becomes None instead of inheriting a different voice.
it('preserves usable local selections and disables unavailable card overrides (Issue #3154)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [], data: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const speech = useSpeechStore(pinia)
  await speech.selectProviderModel('kokoro-local', 'fp32', 'af_heart')
  const hearing = useHearingStore(pinia)
  hearing.activeTranscriptionProvider = 'browser-web-speech-api'
  hearing.activeTranscriptionModel = 'web-speech-api'
  const cards = useAiriCardStore(pinia)
  await cards.initialize()
  await vi.waitFor(() => expect(useProviderStore(pinia).moduleSpeechProvidersMetadata.some(provider => provider.id === 'kokoro-local')).toBe(true))
  const explicit = structuredClone(toRaw(cards.activeCard!))
  explicit.extensions.airi.modules.speech = { provider: 'openai-audio-speech', model: 'tts-1', voice_id: 'alloy' }
  const unavailableId = await cards.addCard(explicit, 'duplicate')

  await maintenance.resetProvidersSettings()

  expect(speech.activeSpeechProvider).toBe('kokoro-local')
  expect(speech.activeSpeechModel).toBe('fp32')
  expect(speech.activeSpeechVoiceId).toBe('af_heart')
  expect(hearing.activeTranscriptionProvider).toBe('browser-web-speech-api')
  expect(hearing.activeTranscriptionModel).toBe('web-speech-api')
  expect(cards.getModules(unavailableId)?.speech).toEqual({ provider: 'speech-noop', model: '', voice_id: '' })
  const snapshot = structuredClone(toRaw(cards.cards))
  await maintenance.resetProvidersSettings()
  await nextTick()
  expect(toRaw(cards.cards)).toEqual(snapshot)
  expect(speech.activeSpeechVoiceId).toBe('af_heart')
})

// https://github.com/moeru-ai/airi/issues/3154
// ROOT CAUSE:
// Custom provider IDs lose their definitions after reset. Account-owned providers also lose settings despite needing no API key.
// Clear both selections before a card initializes, and keep consciousness unchanged.
it('clears removed custom IDs and account-owned providers before card initialization (Issue #3154)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [], data: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const providers = useProviderConfigStore(pinia)
  providers.providers['custom-speech'] = {
    id: 'custom-speech',
    definitionId: 'openai-audio-speech',
    config: { apiKey: 'test-key' },
    status: 'configured',
    configuredBy: 'user',
  }
  providers.providers['custom-vision'] = {
    id: 'custom-vision',
    definitionId: 'openai',
    config: { apiKey: 'test-key' },
    status: 'configured',
    configuredBy: 'user',
  }
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'chat-model'
  const speech = useSpeechStore(pinia)
  await speech.selectProviderModel('custom-speech', 'tts-1', 'alloy')
  const vision = useVisionStore(pinia)
  vision.activeProvider = 'custom-vision'
  vision.activeModel = 'vision-model'
  const hearing = useHearingStore(pinia)
  hearing.activeTranscriptionProvider = 'official-provider-transcription'
  hearing.activeTranscriptionModel = 'auto'
  expect(useAiriCardStore(pinia).activeCard).toBeUndefined()

  await maintenance.resetProvidersSettings()

  expect(speech.activeSpeechProvider).toBe('speech-noop')
  expect(speech.activeSpeechVoiceId).toBe('')
  expect(vision.activeProvider).toBe('')
  expect(vision.activeModel).toBe('')
  expect(hearing.activeTranscriptionProvider).toBe('')
  expect(hearing.activeTranscriptionModel).toBe('')
  expect(consciousness.activeProvider).toBe('openai')
  expect(consciousness.activeModel).toBe('chat-model')
})

// https://github.com/moeru-ai/airi/pull/2490#discussion_r3968502055
// ROOT CAUSE: Sequential awaits stopped independent module cleanup after one
// leader RPC failed. Every reset must settle before the caller receives the error.
it.each(['resetSettings', 'resetState'])('continues independent module resets when the %s RPC fails', async (action) => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const namespace = `maintenance:${crypto.randomUUID()}`
  const leader = mountMaintenance(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = mountMaintenance(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  const { pinia } = follower
  await useConsciousnessSettingsStore(pinia).setReasoning(true)
  useMinecraftStore(pinia).latestRuntimeContextText = 'previous context'
  // A policy that a module reset must clear, so the picker cannot restore it.
  const homeAssistant = useHomeAssistantStore(pinia)
  homeAssistant.exposureMode = 'deny'
  homeAssistant.deniedEntities = ['lock.front_door']
  const modules = [
    useHearingStore(pinia),
    homeAssistant,
    useSpeechStore(pinia),
    useConsciousnessStore(pinia),
    useTwitterStore(pinia),
    useWebSearchStore(pinia),
    useDiscordStore(pinia),
    useFactorioStore(pinia),
    useMinecraftStore(pinia),
  ]
  const resetModules: string[] = []
  for (const module of modules) {
    module.$onAction(({ name }) => {
      if (name === 'resetState')
        resetModules.push(module.$id)
    })
  }
  const postMessage = BroadcastChannel.prototype.postMessage
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (JSON.stringify(message).includes(`"${action}"`))
      throw new Error('Reset transport unavailable')
    postMessage.call(this, message)
  })
  await expect(follower.maintenance.resetModulesSettings()).rejects.toThrow('Reset transport unavailable')
  expect(resetModules).toEqual(modules.map(module => module.$id))
  expect(useMinecraftStore(pinia).latestRuntimeContextText).toBe('')
  expect(homeAssistant.exposureMode).toBe('all')
  expect(homeAssistant.deniedEntities).toEqual([])
  expect(useConsciousnessSettingsStore(leader.pinia).reasoning).toBe(action === 'resetState')
})

// ROOT CAUSE:
// Deleting all data kept long-term memories and recipes, so the character still knew facts about the owner.
it('forgets what the character learned when modules reset', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const memory = useMemoryStore(pinia)
  const recipes = useRecipesStore(pinia)
  await memory.write({ description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'default')
  await recipes.add({ name: 'Check in', description: '', instructions: 'Greet softly.', keywords: [], enabled: true })

  await maintenance.resetModulesSettings()

  expect(memory.entries).toEqual([])
  expect(recipes.recipes.filter(recipe => recipe.source === 'user')).toEqual([])
})

it('removes downloaded speech models when all data is deleted', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const origin = await navigator.storage.getDirectory()
  const root = await origin.getDirectoryHandle('airi-model-assets', { create: true })
  const stored = await (await root.getDirectoryHandle('speech', { create: true }))
    .getDirectoryHandle('v1', { create: true })
  const writable = await (await stored.getFileHandle('data', { create: true })).createWritable()
  await writable.write('model data')
  await writable.close()
  const { runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))

  await maintenance.deleteAllData()

  await expect(origin.getDirectoryHandle('airi-model-assets')).rejects.toThrow()
})

it('removes the voiceprint when all data is deleted', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  localStorage.setItem('settings/voice/voiceprint', JSON.stringify(toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now())))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  expect(useVoiceprintStore(pinia).record).toBeDefined()

  await maintenance.deleteAllData()

  expect(useVoiceprintStore(pinia).record).toBeUndefined()
  expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
})

it('removes the voiceprint when an earlier cleanup fails', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  localStorage.setItem('settings/voice/voiceprint', JSON.stringify(toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now())))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  vi.spyOn(useDisplayModelsStore(pinia), 'resetDisplayModels').mockRejectedValue(new Error('Model storage unavailable'))

  await expect(maintenance.deleteAllData()).rejects.toThrow('Model storage unavailable')

  expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
})
