import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { useProviderConfigStore } from '../providers/config'
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
    .provide(injectKeyPiniaSynced, runtime)
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
    vi.unstubAllGlobals()
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
    const namespace = `speech:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
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
    let finishOld!: (response: Response) => void
    const oldResponse = new Promise<Response>((resolve) => {
      finishOld = resolve
    })
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
    leader.speechStore.$patch({
      activeSpeechProvider: 'official-provider-speech',
      activeSpeechVoiceId: '',
      availableVoices: { 'official-provider-speech': [
        { id: 'fallback', name: 'Fallback', languages: [{ code: 'en-US', title: 'English' }], provider: 'official-provider-speech' },
        { id: 'voice', name: 'Voice', recommendedFor: ['en-US'], languages: [{ code: 'en-US', title: 'English' }], provider: 'official-provider-speech' },
      ] },
    })
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
    let finishOld!: (response: Response) => void
    const oldResponse = new Promise<Response>((resolve) => {
      finishOld = resolve
    })
    let pause = false
    let requests = 0
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      requests++
      if (pause)
        return oldResponse
      return Response.json({ voices: [{ id: 'recovered', name: 'Recovered', languages: [] }] })
    }))
    const survivor = createSyncedContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(survivor.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    leader.speechStore.activeSpeechProvider = 'microsoft-speech'
    await vi.waitFor(() => expect(survivor.speechStore.availableVoices['microsoft-speech']?.[0]?.id).toBe('recovered'))
    await vi.waitFor(() => expect(survivor.speechStore.isLoadingSpeechProviderVoices).toBe(false))
    pause = true
    const beforeRefresh = requests
    const refresh = leader.speechStore.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(requests).toBeGreaterThan(beforeRefresh))
      await vi.waitFor(() => expect(survivor.speechStore.availableVoices['microsoft-speech']).toEqual([]))
      pause = false
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
    const namespace = `speech:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await new Promise(resolve => setTimeout(resolve, 100))

    let finish!: (response: Response) => void
    const response = new Promise<Response>((resolve) => {
      finish = resolve
    })
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
