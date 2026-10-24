import type { LeadershipMode } from 'pinia-plugin-synced'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
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
import { useWebSearchStore } from '../stores/modules/web-search'
import { useRecipesStore } from '../stores/recipes'
import { useVoiceprintStore } from '../stores/voiceprint'
import { useDataMaintenance } from './use-data-maintenance'

const cleanups: Array<() => void | Promise<void>> = []

/** Mounts the maintenance composable with real stores and a separate synchronization runtime. */
function mountMaintenance(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  const pendingActions = new Set<symbol>()
  pinia.use(({ store }) => {
    store.$onAction(({ after, onError }) => {
      const action = Symbol('pending action')
      pendingActions.add(action)
      const settled = () => {
        pendingActions.delete(action)
      }
      after(settled)
      onError(settled)
    })
  })
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
  cleanups.push(async () => {
    // Imported settings wake asynchronous store watchers. Finish their actions before the transport closes.
    await nextTick()
    await vi.waitFor(() => expect(pendingActions.size).toBe(0))
    app.unmount()
    channel.dispose()
    disposePinia(pinia)
    runtime.dispose()
  })
  if (!maintenance)
    throw new Error('Maintenance composable did not initialize')
  return { pinia, runtime, maintenance }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
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
  memory.write({ name: 'nickname', description: 'What the owner likes to be called.', body: 'Yumeka.' }, 'default')
  recipes.add({ name: 'Check in', description: '', instructions: 'Greet softly.', keywords: [], enabled: true })

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

// ROOT CAUSE:
// Current voice values defined the schema. Fixed optional fields let backups cross different selections.
it.each([true, false])('restores speech voices independently of the destination selection (selected: %s)', async (selected) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const speech = useSpeechStore(pinia)
  const voice = { id: 'backup-voice', name: 'Backup voice', provider: 'speech-noop', languages: [{ code: 'en', title: 'English' }], previewURL: '' }
  speech.activeSpeechVoice = selected ? voice : undefined
  const adapter = maintenance.createModuleSettingsExportAdapter()
  const file = new File([await adapter.encode(await adapter.read())], 'modules.json')
  speech.activeSpeechVoice = selected ? undefined : voice
  const importer = maintenance.createModuleSettingsImportAdapter()

  await importer.apply(await importer.validate(await importer.decode(file)))

  expect(speech.activeSpeechVoice).toEqual(selected ? voice : undefined)
})

// ROOT CAUSE:
// Pinia state omitted the computed exposure mode. The backup contract now captures it and restores its persisted setter.
it.each(['allow', 'deny'] as const)('preserves the Home Assistant %s policy through a backup', async (mode) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const homeAssistant = useHomeAssistantStore(pinia)
  homeAssistant.enabled = true
  homeAssistant.exposureMode = mode
  homeAssistant.allowedEntities = ['light.living_room']
  homeAssistant.deniedEntities = ['lock.front_door']
  const adapter = maintenance.createModuleSettingsExportAdapter()
  const file = new File([await adapter.encode(await adapter.read())], 'modules.json')
  homeAssistant.resetState()
  const importer = maintenance.createModuleSettingsImportAdapter()

  await importer.apply(await importer.validate(await importer.decode(file)))

  expect(homeAssistant.exposureMode).toBe(mode)
  expect(homeAssistant.exposure).toEqual({ mode, entityIds: mode === 'allow' ? ['light.living_room'] : ['lock.front_door'] })
  expect(localStorage.getItem('settings/home-assistant/exposure-mode')).toBe(mode)
  expect(homeAssistant.enabled).toBe(true)
})

it('persists restored consciousness policies', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const settings = useConsciousnessSettingsStore(pinia)
  await settings.setReasoning(true)
  await settings.setTemperatureEnabled(true)
  await settings.setTopPEnabled(true)
  const exporter = maintenance.createModuleSettingsExportAdapter()
  const file = new File([await exporter.encode(await exporter.read())], 'modules.json')
  await settings.resetState()
  const importer = maintenance.createModuleSettingsImportAdapter()

  await importer.apply(await importer.validate(await importer.decode(file)))

  const reopened = useConsciousnessSettingsStore(createPinia())
  expect(reopened.reasoning).toBe(true)
  expect(reopened.temperatureEnabled).toBe(true)
  expect(reopened.topPEnabled).toBe(true)
})

it('uses the same fixed contract for export and import validation', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  const exporter = maintenance.createModuleSettingsExportAdapter()
  const importer = maintenance.createModuleSettingsImportAdapter()
  const data = await exporter.read()
  delete data.homeAssistant.exposureMode

  await expect(exporter.encode(data)).rejects.toThrow()
  await expect(importer.validate({ format: 'airi-module-settings', version: 1, data })).rejects.toThrow()

  useSpeechStore(pinia).pitch = Number.NaN

  await expect(exporter.encode(await exporter.read())).rejects.toThrow()
})

it('restores app settings and cards across optional renderer values and different motion maps', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [] })))
  const { pinia, runtime, maintenance } = mountMaintenance(`maintenance:${crypto.randomUUID()}`, 'leader-only')
  await vi.waitFor(() => expect(runtime.isLeader()).toBe(true))
  await useAiriCardStore(pinia).initialize()
  const exporter = maintenance.createAppSettingsExportAdapter()
  const importer = maintenance.createAppSettingsImportAdapter()
  const data = await exporter.read()
  data.settings.stageModelRenderer = 'live2d'
  data.live2dParameters.motionMap = { greeting: 'wave' }
  const file = new File([await exporter.encode(data)], 'settings.json')

  await importer.apply(await importer.validate(await importer.decode(file)))

  const restored = await exporter.read()
  expect(restored.settings.stageModelRenderer).toBe('live2d')
  expect(restored.live2dParameters.motionMap).toEqual({ greeting: 'wave' })
  expect(restored.characterCards.cards).toEqual(data.characterCards.cards)

  delete data.settings.stageModelRenderer
  data.live2dParameters.motionMap = { farewell: 'bow' }
  await importer.apply(await importer.validate(await importer.decode(new File([await exporter.encode(data)], 'settings.json'))))

  const cleared = await exporter.read()
  expect(cleared.settings.stageModelRenderer).toBeUndefined()
  expect(cleared.live2dParameters.motionMap).toEqual({ farewell: 'bow' })
})
