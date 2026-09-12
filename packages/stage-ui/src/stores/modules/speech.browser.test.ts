import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { toProviderConfigSnapshot } from '../../libs/providers/config'
import { useAuthStore } from '../auth'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useSpeechStore } from './speech'

const syncedContexts: Array<{
  app: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

/** Creates one mounted speech-store renderer with explicit leadership. */
function createSyncedContext(namespace: string, leadership: LeadershipMode, withCards = false) {
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
      if (withCards)
        useAiriCardStore()
      return () => null
    },
  })
  app
    .provide(injectKeyPiniaSynced, runtime)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .mount(document.createElement('div'))

  if (!speechStore)
    throw new Error('Speech store did not initialize')

  syncedContexts.push({ app, pinia, runtime })
  return { pinia, runtime, speechStore }
}

/** Creates two real renderers and waits until their leader routing agrees. */
async function createSyncedPair() {
  const namespace = `speech:${crypto.randomUUID()}`
  const leader = createSyncedContext(namespace, 'leader-only')
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const follower = createSyncedContext(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
  return { leader, follower }
}

describe('speech synchronization', () => {
  // https://github.com/moeru-ai/airi/issues/2523
  // ROOT CAUSE:
  //
  // The ElevenLabs settings watcher passed its live reactive configuration to
  // a leader-routed validation action. BroadcastChannel tried to clone that
  // proxy before the action ran and rejected the call with DataCloneError.
  // The rejected watcher then skipped voice discovery.
  //
  // We fixed this by taking a deep plain snapshot before the synchronized call.
  it('validates ElevenLabs and loads voices from a follower renderer', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      voices: [{
        id: 'test-voice',
        name: 'Test Voice',
        preview_audio_url: 'https://voices.invalid/preview.mp3',
      }],
    })))
    const { leader, follower } = await createSyncedPair()
    const leaderConfig = useProviderConfigStore(leader.pinia)
    await leaderConfig.ensureProvider('elevenlabs', 'elevenlabs', {
      apiKey: '',
      baseUrl: 'https://voices.invalid/v1/',
    })

    const followerConfig = useProviderConfigStore(follower.pinia)
    await vi.waitFor(() => expect(followerConfig.getProviderConfig('elevenlabs')?.apiKey).toBe(''))
    await followerConfig.patchProviderConfig('elevenlabs', { apiKey: 'test-key' })
    await vi.waitFor(() => expect(leaderConfig.getProviderConfig('elevenlabs')?.apiKey).toBe('test-key'))

    const liveConfig = followerConfig.getProviderConfig('elevenlabs')
    const snapshot = toProviderConfigSnapshot(liveConfig)
    const validation = await useProviderStore(follower.pinia).validateProviderConfig('elevenlabs', snapshot)
    const voices = await follower.speechStore.loadVoicesForProvider('elevenlabs')

    expect(validation.valid).toBe(true)
    expect(voices).toEqual([expect.objectContaining({
      id: 'test-voice',
      name: 'Test Voice',
      provider: 'elevenlabs',
    })])
    await vi.waitFor(() => expect(leader.speechStore.availableVoices.elevenlabs).toEqual(voices))
    await vi.waitFor(() => expect(follower.speechStore.availableVoices.elevenlabs).toEqual(voices))
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3967949219
  // ROOT CAUSE: Catalog invalidation erased the voice just applied by a card.
  // The selection command must discard the old catalog before setting the override.
  it.each(['microsoft-speech', 'official-provider-speech'])('preserves a card voice while its new %s model catalog loads', async (provider) => {
    const deferred = Promise.withResolvers<Response>()
    let pause = false
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => pause
      ? deferred.promise.then(response => response.clone())
      : Response.json({ voices: [{ id: 'old', name: 'Old', languages: [] }], data: [] })))
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only', true)
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createSyncedContext(namespace, 'follower-only', true)
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    if (provider === 'official-provider-speech') {
      const now = new Date()
      useAuthStore(leader.pinia).$patch({
        token: 'access-token',
        user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
        session: { id: 'session', userId: 'owner', token: 'session-token', createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000) },
      })
    }
    await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/', region: 'eastasia' })
    await useProviderStore(leader.pinia).forceProviderConfigured(provider)
    await leader.speechStore.selectProviderModel(provider, 'model-a', 'old')
    await vi.waitFor(() => expect(leader.speechStore.availableVoices[provider]?.[0]?.id).toBe('old'))
    await vi.waitFor(() => expect(follower.speechStore.activeSpeechVoice?.id).toBe('old'))
    const cards = useAiriCardStore(leader.pinia)
    await cards.initialize()
    const id = await cards.addCard({
      name: 'Saved voice',
      version: '1.0',
      description: '',
      extensions: { airi: { modules: { speech: { provider, model: 'model-b', voice_id: 'saved' } } } },
    }, 'scratch')
    pause = true
    try {
      await cards.activateCard(id)
      await vi.waitFor(() => expect(leader.speechStore.availableVoices[provider]).toEqual([]))
      expect(leader.speechStore.activeSpeechVoiceId).toBe('saved')
      deferred.resolve(Response.json({
        voices: [{ id: 'recommended', name: 'Recommended', languages: [] }, { id: 'saved', name: 'Saved', languages: [] }],
        recommended: { en: 'recommended' },
      }))
      await vi.waitFor(() => expect(follower.speechStore.activeSpeechVoice?.id).toBe('saved'))
      expect(follower.speechStore.activeSpeechModel).toBe('model-b')
      // Consecutive commands must not capture the first card's override as
      // an inherited default while its leader action yields.
      await cards.activateCard('default')
      await Promise.all([cards.activateCard(id), cards.activateCard('default')])
      expect(leader.speechStore.activeSpeechModel).toBe('model-a')
      expect(cards.moduleDefaults?.speech.model).toBe('model-a')
    }
    finally {
      deferred.resolve(Response.json({ voices: [] }))
    }
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3967949224
  // ROOT CAUSE: HTTP discovery returned only models, leaving the server default
  // in the outgoing renderer instead of the replicated provider catalog.
  it('replicates the HTTP speech default to the next leader', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      models: [{ id: 'first', name: 'First' }, { id: 'preferred', name: 'Preferred' }],
      default: 'preferred',
      voices: [],
    })))
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const survivor = createSyncedContext(namespace, 'follower-preferred')
    const provider = 'official-provider-speech'
    await useProviderStore(leader.pinia).fetchModelsForProvider(provider)
    await vi.waitFor(() => expect(useProviderStore(survivor.pinia).getDefaultModelForProvider(provider)).toBe('preferred'))
    const outgoing = syncedContexts.find(context => context.runtime === leader.runtime)!
    outgoing.app.unmount()
    disposePinia(outgoing.pinia)
    outgoing.runtime.dispose()
    syncedContexts.splice(syncedContexts.indexOf(outgoing), 1)
    await vi.waitFor(() => expect(survivor.runtime.isLeader()).toBe(true), { timeout: 5000 })
    await survivor.speechStore.selectProviderModel(provider, '')
    expect(survivor.speechStore.activeSpeechModel).toBe('preferred')
  })
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
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3965793949
  // ROOT CAUSE: A delayed settings proposal carried an old catalog and replaced
  // a completed leader load. Catalog state must have a separate snapshot owner.
  it('preserves a fresh catalog after a delayed follower settings proposal', async () => {
    const { leader, follower } = await createSyncedPair()
    await new Promise(resolve => setTimeout(resolve, 100))
    const postMessage = BroadcastChannel.prototype.postMessage
    const delayed: Array<() => void> = []
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
      if (JSON.stringify(message).includes('replaceState')) {
        const snapshot = structuredClone(message)
        delayed.push(() => postMessage.call(this, snapshot))
        return
      }
      postMessage.call(this, message)
    })
    follower.speechStore.pitch = 15
    follower.speechStore.ssmlEnabled = true
    await vi.waitFor(() => expect(delayed.length).toBeGreaterThan(0))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [{ id: 'fresh', name: 'Fresh', languages: [] }] })))
    await leader.speechStore.loadVoiceCatalog('microsoft-speech', 'model', {
      definitionId: 'microsoft-speech',
      config: { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/', region: 'eastasia' },
    })
    await vi.waitFor(() => expect(follower.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('fresh'))
    traffic.mockRestore()
    for (const deliver of delayed)
      deliver()
    await vi.waitFor(() => expect(leader.speechStore.pitch).toBe(15))
    expect(leader.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('fresh')
    expect(leader.speechStore.voiceCatalogIdentities['microsoft-speech']?.model).toBe('model')
    expect(follower.speechStore.$state).not.toHaveProperty('availableVoices')
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3965793956
  // ROOT CAUSE: Reset canceled the caller and leader, but left a third
  // renderer waiting. Every renderer must observe the reset generation.
  it('cancels waits in a third renderer when another follower resets', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://voices.invalid/v1/',
      region: 'eastasia',
    })
    const caller = createSyncedContext(namespace, 'follower-only')
    const other = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(useProviderConfigStore(other.pinia).configs['microsoft-speech']?.apiKey).toBe('key'))
    const { promise: response, resolve: finish } = Promise.withResolvers<Response>()
    const fetchCatalog = vi.fn<typeof fetch>(() => response)
    vi.stubGlobal('fetch', fetchCatalog)
    const pending = other.speechStore.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(fetchCatalog).toHaveBeenCalledOnce())
      await caller.speechStore.resetState()
      await vi.waitFor(() => expect(other.speechStore.voiceCatalogStatus['microsoft-speech']).toBeUndefined(), { timeout: 400 })
      await expect(pending).resolves.toEqual([])
    }
    finally {
      finish(Response.json({ voices: [] }))
      await pending
    }
  })

  // ROOT CAUSE: A request can still be in the transport queue during reset.
  // The captured generation rejects it before the provider starts new IO.
  it('rejects a pre-reset catalog RPC delivered after reset', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://voices.invalid/v1/',
      region: 'eastasia',
    })
    const follower = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await vi.waitFor(() => expect(useProviderConfigStore(follower.pinia).configs['microsoft-speech']?.apiKey).toBe('key'))
    await new Promise(resolve => setTimeout(resolve, 100))
    const fetchCatalog = vi.fn<typeof fetch>(async () => Response.json({ voices: [] }))
    vi.stubGlobal('fetch', fetchCatalog)
    const postMessage = BroadcastChannel.prototype.postMessage
    const delayed: Array<() => void> = []
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
      if (JSON.stringify(message).includes('loadVoiceCatalog')) {
        const snapshot = structuredClone(message)
        delayed.push(() => postMessage.call(this, snapshot))
        return
      }
      postMessage.call(this, message)
    })
    const pending = follower.speechStore.loadVoicesForProvider('microsoft-speech')
    await vi.waitFor(() => expect(delayed.length).toBeGreaterThan(0))
    await follower.speechStore.resetState()
    traffic.mockRestore()
    for (const deliver of delayed)
      deliver()
    await expect(pending).resolves.toEqual([])
    // Await the same channel's next action so the delayed request has run.
    await follower.speechStore.ensureActiveSpeechVoice()
    expect(fetchCatalog).not.toHaveBeenCalled()
    expect(leader.speechStore.availableVoices['microsoft-speech']).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3965793959
  // ROOT CAUSE: A new configuration cleared the catalog but kept its selected
  // voice. Failed replacement IO then left speech configured with a stale voice.
  it('clears the selected voice before loading a different configuration', async () => {
    const leader = createSyncedContext(`speech:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://old.invalid/v1/',
      region: 'eastasia',
    })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [{ id: 'old', name: 'Old', languages: [] }] })))
    await leader.speechStore.selectProviderModel('microsoft-speech', 'model')
    await vi.waitFor(() => expect(leader.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('old'))
    leader.speechStore.activeSpeechVoiceId = 'old'
    await leader.speechStore.ensureActiveSpeechVoice()
    expect(leader.speechStore.configured).toBe(true)
    const { promise: response, reject: fail } = Promise.withResolvers<Response>()
    const fetchCatalog = vi.fn<typeof fetch>(() => response)
    vi.stubGlobal('fetch', fetchCatalog)
    const pending = leader.speechStore.loadVoiceCatalog('microsoft-speech', 'model', {
      definitionId: 'microsoft-speech',
      config: { apiKey: 'new-key', baseUrl: 'https://new.invalid/v1/', region: 'westus' },
    })
    const rejection = expect(pending).rejects.toThrow('unavailable')
    try {
      await vi.waitFor(() => expect(fetchCatalog).toHaveBeenCalledOnce())
      expect(leader.speechStore.activeSpeechVoiceId).toBe('')
      expect(leader.speechStore.activeSpeechVoice).toBeUndefined()
      expect(leader.speechStore.configured).toBe(false)
    }
    finally {
      fail(new Error('unavailable'))
      await rejection
    }
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
    const { leader: leaderContext, follower: followerContext } = await createSyncedPair()
    await new Promise(resolve => setTimeout(resolve, 50))

    let leaderLoads = 0
    leaderContext.speechStore.$onAction(({ name }) => {
      if (name === 'loadVoiceCatalog')
        leaderLoads++
    })
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    await followerContext.speechStore.loadVoicesForProvider('speech-noop')

    expect(leaderLoads).toBe(1)
    const proposals = traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))
    expect(proposals).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3960117797
  // ROOT CAUSE:
  // The provider watcher called its setup-scope function, bypassing the public
  // action wrapper. A replicated provider change then published follower state.
  // Route watcher requests through the exposed action after store setup.
  it('routes replicated provider watcher loading through the leader', async () => {
    const { leader: leaderContext, follower: followerContext } = await createSyncedPair()
    await new Promise(resolve => setTimeout(resolve, 50))

    leaderContext.speechStore.activeSpeechProvider = ''
    await vi.waitFor(() => expect(followerContext.speechStore.activeSpeechProvider).toBe(''))
    await new Promise(resolve => setTimeout(resolve, 100))
    let leaderLoads = 0
    leaderContext.speechStore.$onAction(({ name }) => {
      if (name === 'loadVoiceCatalog')
        leaderLoads++
    })
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    leaderContext.speechStore.activeSpeechProvider = 'speech-noop'
    await vi.waitFor(() => expect(followerContext.speechStore.activeSpeechProvider).toBe('speech-noop'))
    // Both renderers observe the provider, but both requests execute in the leader.
    await vi.waitFor(() => expect(leaderLoads).toBe(2))
    await new Promise(resolve => setTimeout(resolve, 100))

    const proposals = traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))
    expect(proposals).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964660976
  // ROOT CAUSE: A follower selection proposed a full snapshot containing the
  // previous catalog while an independent RPC loaded its replacement.
  it('commits follower provider and model selection without stale snapshot proposals', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://voices.invalid/v1/',
      region: 'eastasia',
    })
    const follower = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(useProviderConfigStore(follower.pinia).configs['microsoft-speech']?.apiKey).toBe('key'))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [{ id: 'fresh', name: 'Fresh', languages: [] }] })))
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await follower.speechStore.selectProviderModel('microsoft-speech', 'model-a')
    expect(follower.speechStore.activeSpeechModel).toBe('model-a')
    await vi.waitFor(() => expect(follower.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('fresh'))
    expect(leader.speechStore.activeSpeechModel).toBe('model-a')
    await follower.speechStore.selectProviderModel('microsoft-speech', 'model-b')
    expect(follower.speechStore.activeSpeechModel).toBe('model-b')
    await vi.waitFor(() => expect(follower.speechStore.voiceCatalogIdentities['microsoft-speech']?.model).toBe('model-b'))
    expect(follower.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('fresh')
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3960349403
  // ROOT CAUSE:
  // Configuration proposals and voice RPCs use independent queues. Capture
  // request configuration in the caller instead of reading a stale leader copy.
  it('loads voices with the follower configuration before its snapshot arrives', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const leaderConfig = useProviderConfigStore(leader.pinia)
    await leaderConfig.ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'old-key',
      baseUrl: 'https://old.invalid/v1/',
      region: 'eastasia',
    })
    const follower = createSyncedContext(namespace, 'follower-only')
    const followerConfig = useProviderConfigStore(follower.pinia)
    await vi.waitFor(() => expect(followerConfig.configs['microsoft-speech']?.apiKey).toBe('old-key'))
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      requests.push(String(input))
      return Response.json({ voices: [] })
    }))
    followerConfig.configs['microsoft-speech'].baseUrl = 'https://new.invalid/v1/'
    await follower.speechStore.loadVoicesForProvider('microsoft-speech')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain('https://new.invalid/')
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3960349408
  // ROOT CAUSE:
  // Leader RPC failures bypassed the loader's provider catch block. Public
  // loading must contain transport failures without mutating follower state.
  it('contains voice RPC failure when the synchronization runtime closes', async () => {
    const context = createSyncedContext(`speech:${crypto.randomUUID()}`, 'follower-only')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loading = context.speechStore.loadVoicesForProvider('speech-noop')
    context.runtime.dispose()
    await expect(loading).resolves.toEqual([])
    expect(errors).toHaveBeenCalled()
    expect(context.speechStore.speechProviderError).toBeNull()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3960349403
  // ROOT CAUSE:
  // A slow response for earlier configuration must not overwrite the catalog
  // returned for the newer configuration carried by a subsequent command.
  it('keeps the newer configuration catalog when an older response arrives last', async () => {
    const context = createSyncedContext(`speech:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    const config = useProviderConfigStore(context.pinia)
    await config.ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://old.invalid/v1/',
      region: 'eastasia',
    })
    const { promise: oldResponse, resolve: finishOld } = Promise.withResolvers<Response>()
    let requests = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      requests++
      if (requests === 1)
        return oldResponse
      return Response.json({ voices: [{ id: 'new', name: 'New', languages: [] }] })
    }))
    const oldLoad = context.speechStore.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(requests).toBe(1))
      config.configs['microsoft-speech'].baseUrl = 'https://new.invalid/v1/'
      await context.speechStore.loadVoicesForProvider('microsoft-speech')
      finishOld(Response.json({ voices: [{ id: 'old', name: 'Old', languages: [] }] }))
      await oldLoad
      expect(context.speechStore.availableVoices['microsoft-speech'][0]?.id).toBe('new')
    }
    finally {
      finishOld(Response.json({ voices: [] }))
      await oldLoad
    }
  })
  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3960674493
  // ROOT CAUSE: A remote catalog triggered local auto-pick state proposals.
  it('routes automatic voice selection to the leader without follower proposals', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createSyncedContext(namespace, 'follower-only')
    await new Promise(resolve => setTimeout(resolve, 100))
    let selections = 0
    leader.speechStore.$onAction(({ name }) => {
      if (name === 'ensureActiveSpeechVoice')
        selections++
    })
    // Complete provider initialization before delivering a replacement catalog.
    leader.speechStore.activeSpeechProvider = 'official-provider-speech'
    await new Promise(resolve => setTimeout(resolve, 100))
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      flux: 0,
      voices: [
        { id: 'fallback', name: 'Fallback', languages: [{ code: 'en-US', title: 'English' }] },
        { id: 'voice', name: 'Voice', languages: [{ code: 'en-US', title: 'English' }] },
      ],
      recommended: { 'en-US': 'voice' },
    })))
    const now = new Date()
    useAuthStore(leader.pinia).$patch({
      token: 'access-token',
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session', userId: 'owner', token: 'session-token', createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000) },
    })
    await vi.waitFor(() => expect(useAuthStore(follower.pinia).isAuthenticated).toBe(true))
    await leader.speechStore.loadVoicesForProvider('official-provider-speech')
    await vi.waitFor(() => expect(follower.speechStore.activeSpeechVoiceId).toBe('voice'))
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(selections).toBeGreaterThan(0)
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
  })
  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964170541
  // ROOT CAUSE: A replicated loading flag outlived the leader's request after tab closure.
  it('recovers an interrupted catalog when the surviving renderer becomes leader', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const config = useProviderConfigStore(leader.pinia)
    await config.ensureProvider('microsoft-speech', 'microsoft-speech', { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/', region: 'eastasia' })
    const { promise: oldResponse, resolve: finishOld } = Promise.withResolvers<Response>()
    let pause = false
    let catalogVersion = 'cached'
    let requests = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      requests++
      if (pause)
        return oldResponse
      return Response.json({ voices: [{ id: catalogVersion, name: catalogVersion, languages: [] }] })
    }))
    const survivor = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(survivor.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    leader.speechStore.activeSpeechProvider = 'microsoft-speech'
    await vi.waitFor(() => expect(survivor.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('cached'))
    await vi.waitFor(() => expect(survivor.speechStore.isLoadingSpeechProviderVoices).toBe(false))
    pause = true
    const beforeRefresh = requests
    const refresh = leader.speechStore.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(requests).toBeGreaterThan(beforeRefresh))
      // Same-identity refreshes preserve the last successful catalog during IO.
      expect(survivor.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('cached')
      pause = false
      catalogVersion = 'recovered'
      // Dispose the outgoing renderer's store scopes as closing a tab would.
      const outgoing = syncedContexts.find(context => context.runtime === leader.runtime)!
      outgoing.app.unmount()
      disposePinia(outgoing.pinia)
      outgoing.runtime.dispose()
      syncedContexts.splice(syncedContexts.indexOf(outgoing), 1)
      await vi.waitFor(() => expect(survivor.runtime.isLeader()).toBe(true), { timeout: 5000 })
      await vi.waitFor(() => expect(survivor.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('recovered'), { timeout: 5000 })
      await vi.waitFor(() => expect(survivor.speechStore.isLoadingSpeechProviderVoices).toBe(false))
      expect(survivor.pinia.state.value.speech).not.toHaveProperty('voiceCatalogStatus')
    }
    finally {
      finishOld(Response.json({ voices: [] }))
      await refresh
    }
  })
  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964310221
  // ROOT CAUSE:
  // A follower reset cleared only its local request map. The leader could then
  // accept a pending response and restore the catalog after the reset.
  // The reset must invalidate requests and clear settings in the same leader.
  it('rejects a pending leader catalog after a follower resets speech settings', async () => {
    const { leader, follower } = await createSyncedPair()
    await new Promise(resolve => setTimeout(resolve, 100))

    const { promise: response, resolve: finish } = Promise.withResolvers<Response>()
    const fetchCatalog = vi.fn<typeof fetch>(() => response)
    vi.stubGlobal('fetch', fetchCatalog)
    const pending = leader.speechStore.loadVoiceCatalog('microsoft-speech', undefined, {
      definitionId: 'microsoft-speech',
      config: { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/', region: 'eastasia' },
    })
    try {
      await vi.waitFor(() => expect(fetchCatalog).toHaveBeenCalledOnce())
      await vi.waitFor(() => expect(follower.speechStore.availableVoices['microsoft-speech']).toEqual([]))
      const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
      await follower.speechStore.resetState()
      finish(Response.json({ voices: [{ id: 'stale', name: 'Stale', languages: [] }] }))
      await expect(pending).resolves.toEqual([])
      expect(leader.speechStore.availableVoices['microsoft-speech']).toBeUndefined()
      await vi.waitFor(() => expect(follower.speechStore.availableVoices['microsoft-speech']).toBeUndefined())
      expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    }
    finally {
      finish(Response.json({ voices: [] }))
      await pending
    }
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964550171
  // ROOT CAUSE:
  // A synchronized reset ran only in the leader and left the caller's local
  // waiters loading. Cancel local waits before awaiting the shared reset.
  it('settles follower catalog waits on reset before the network responds', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://voices.invalid/v1/',
      region: 'eastasia',
    })
    const follower = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(useProviderConfigStore(follower.pinia).configs['microsoft-speech']?.apiKey).toBe('key'))
    const { promise: response, resolve: finish } = Promise.withResolvers<Response>()
    const fetchCatalog = vi.fn<typeof fetch>(() => response)
    vi.stubGlobal('fetch', fetchCatalog)
    const first = follower.speechStore.loadVoicesForProvider('microsoft-speech')
    const second = follower.speechStore.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(fetchCatalog).toHaveBeenCalledOnce())
      expect(follower.speechStore.voiceCatalogStatus['microsoft-speech']?.loading).toBe(true)
      await follower.speechStore.resetState()
      expect(follower.speechStore.voiceCatalogStatus['microsoft-speech']).toBeUndefined()
      await expect(first).resolves.toEqual([])
      await expect(second).resolves.toEqual([])
      await follower.speechStore.resetState()
      expect(follower.speechStore.voiceCatalogStatus['microsoft-speech']).toBeUndefined()
    }
    finally {
      finish(Response.json({ voices: [] }))
      await Promise.all([first, second])
    }
  })

  it('invalidates completed owned catalogs across renderers without follower proposals', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      flux: 0,
      voices: [{ id: 'previous-owner', name: 'Previous owner', languages: [] }],
    })))
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createSyncedContext(namespace, 'follower-only')
    const auth = useAuthStore(leader.pinia)
    const now = new Date()
    auth.$patch({
      token: 'access-token',
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session', userId: 'owner', token: 'session-token', createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000) },
    })
    await vi.waitFor(() => expect(useAuthStore(follower.pinia).user?.id).toBe('owner'))
    await leader.speechStore.loadVoicesForProvider('official-provider-speech', 'model-a')
    await vi.waitFor(() => expect(follower.speechStore.availableVoices['official-provider-speech']?.[0]?.id).toBe('previous-owner'))
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    auth.$patch({ token: null, session: null, user: null })
    await vi.waitFor(() => expect(follower.speechStore.availableVoices['official-provider-speech']).toEqual([]))
    expect(leader.speechStore.availableVoices['official-provider-speech']).toEqual([])
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
  })

  it('reports a leader provider failure only in the requesting renderer', async () => {
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const config = useProviderConfigStore(leader.pinia)
    await config.ensureProvider('microsoft-speech', 'microsoft-speech', { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/', region: 'eastasia' })
    const follower = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(useProviderConfigStore(follower.pinia).configs['microsoft-speech']?.apiKey).toBe('key'))
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new Error('catalog unavailable')
    }))
    await expect(follower.speechStore.loadVoicesForProvider('microsoft-speech')).resolves.toEqual([])
    expect(follower.speechStore.voiceCatalogStatus['microsoft-speech']?.error).toContain('catalog unavailable')
    expect(follower.speechStore.voiceCatalogStatus['microsoft-speech']?.loading).toBe(false)
    expect(leader.speechStore.voiceCatalogStatus['microsoft-speech']).toBeUndefined()
  })
})
