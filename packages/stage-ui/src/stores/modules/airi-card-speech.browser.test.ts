import type { Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { BrowserPlayback } from '@proj-airi/audio/browser'
import { Playback } from '@proj-airi/pipelines-audio'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, toRaw } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechSettings from '../../../../stage-pages/src/pages/settings/modules/speech.vue'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { useAuthStore } from '../auth'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'

const cleanups: Array<() => void> = []
const initializations: Array<Promise<void>> = []

/** Mounts a real renderer with a separate Pinia and BroadcastChannel runtime. */
function mountRenderer(namespace: string, page?: Component) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership: page ? 'follower-only' : 'leader-only' })
  pinia.use(runtime.plugin)
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({
    setup() {
      useSpeechStore()
      useHearingStore()
      const cards = useAiriCardStore()
      initializations.push(cards.initialize())
      return () => page ? h(page) : null
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }] })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
    .use(PiniaColada)
    .use(router)
    .use(MotionPlugin)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .mount(container)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    runtime.dispose()
    container.remove()
  })
  return { app, pinia, runtime, container, speech: useSpeechStore(pinia) }
}

/** Provides the external session needed by official speech discovery. */
function authenticate(pinia: ReturnType<typeof createPinia>) {
  const now = new Date()
  useAuthStore(pinia).$patch({
    token: 'access-token',
    user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
    session: { id: 'session', userId: 'owner', token: 'session-token', createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000) },
  })
}

afterEach(async () => {
  await Promise.all(initializations.splice(0))
  for (const cleanup of cleanups.splice(0).reverse())
    cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/issues/2861
// ROOT CAUSE:
// Automatic discovery updated the speech store, but chat read an empty card voice.
// Complete the owning character selection after discovery, before another turn.
it.each(['automatic', 'explicit'])('uses the displayed voice after %s selection (Issue #2861)', async (selection) => {
  localStorage.clear()
  const voices = Promise.withResolvers<Response>()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('voices'))
      return voices.promise.then(response => response.clone())
    return Response.json({ models: [{ id: 'voice-pack', name: 'Voice pack' }], default: 'voice-pack', data: [], flux: 0 })
  }))
  const namespace = `issue-2861:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  authenticate(leader.pinia)
  const provider = 'official-provider-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, {})
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  const cards = useAiriCardStore(leader.pinia)
  await cards.initialize()
  await cards.updateActiveCardSpeech({ provider: 'speech-noop', model: '', voice_id: '' })
  const follower = mountRenderer(namespace, SpeechSettings)
  try {
    await vi.waitFor(() => expect(follower.container.querySelector('input[value="official-provider-speech"]')).not.toBeNull())
    expect(follower.container.querySelector('[data-speech-state="muted"]')).not.toBeNull()
    follower.container.querySelector<HTMLInputElement>('input[value="official-provider-speech"]')!.click()
    await vi.waitFor(() => expect(cards.activeCard?.extensions.airi.modules.speech.provider).toBe(provider))
    await expect.poll(() => follower.container.querySelector('[data-speech-state="loading"]')).not.toBeNull()
    voices.resolve(Response.json({
      voices: [{ id: 'airi-girl', name: 'AIRI Girl', languages: [{ code: 'en', title: 'English' }] }],
      recommended: { en: 'airi-girl' },
    }))
    await vi.waitFor(() => expect(follower.speech.activeSpeechVoiceId).toBe('airi-girl'))
    await vi.waitFor(() => expect(follower.container.textContent).toContain('AIRI Girl'))
    if (selection === 'explicit') {
      await cards.updateActiveCardSpeech({
        provider: follower.speech.activeSpeechProvider,
        model: follower.speech.activeSpeechModel,
        voice_id: follower.speech.activeSpeechVoiceId,
      })
    }
    await expect.poll(() => cards.getModules(cards.activeCardId).speech.voice_id).toBe('airi-girl')
    const followerCards = useAiriCardStore(follower.pinia)
    await expect.poll(() => followerCards.getModules(cards.activeCardId).speech.voice_id).toBe('airi-girl')
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await cards.configureSpeechSelection(cards.activeCardId)
    await nextTick()
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
  }
  finally {
    voices.resolve(Response.json({ voices: [] }))
  }
})

// https://github.com/moeru-ai/airi/issues/2861
it('completes inherited defaults without creating card overrides (Issue #2861)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    models: [{ id: 'voice-pack', name: 'Voice pack' }],
    default: 'voice-pack',
    data: [],
    voices: [{ id: 'airi-girl', name: 'AIRI Girl', languages: [{ code: 'en', title: 'English' }] }],
    recommended: { en: 'airi-girl' },
  })))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  const cards = useAiriCardStore(leader.pinia)
  await cards.configureForAuthentication(true)
  await expect.poll(() => cards.getModules('default').speech).toEqual({
    provider: 'official-provider-speech',
    model: 'voice-pack',
    voice_id: 'airi-girl',
  })
  expect(cards.activeCard?.extensions.airi.modules.speech).toEqual({ provider: '', model: '', voice_id: '' })
  expect(cards.moduleDefaults?.speech.voice_id).toBe('airi-girl')
  await nextTick()
  expect(JSON.parse(localStorage.getItem('airi-card-module-defaults')!).speech.voice_id).toBe('airi-girl')
})

// https://github.com/moeru-ai/airi/issues/2861
it.each(['voice', 'mute', 'character'])('preserves a later %s selection while discovery is pending (Issue #2861)', async (change) => {
  localStorage.clear()
  const voices = Promise.withResolvers<Response>()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('voices'))
      return voices.promise.then(response => response.clone())
    return Response.json({ models: [{ id: 'voice-pack', name: 'Voice pack' }], default: 'voice-pack', data: [] })
  }))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  const provider = 'official-provider-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, {})
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  const cards = useAiriCardStore(leader.pinia)
  const initial = { provider, model: 'voice-pack', voice_id: '' }
  const id = await cards.addCard({
    name: 'Waiting for a voice',
    version: '1.0',
    description: '',
    extensions: { airi: { modules: { speech: initial } } },
  }, 'scratch')
  await cards.activateCard(id)
  const completion = cards.configureSpeechSelection(id)
  try {
    await expect.poll(() => leader.speech.isLoadingSpeechProviderVoices).toBe(true)
    const selected = change === 'mute'
      ? { provider: 'speech-noop', model: '', voice_id: '' }
      : { provider, model: 'voice-pack', voice_id: 'saved-voice' }
    if (change === 'character') {
      const otherId = await cards.addCard({
        name: 'Other character',
        version: '1.0',
        description: '',
        extensions: { airi: { modules: { speech: selected } } },
      }, 'scratch')
      await cards.activateCard(otherId)
    }
    else {
      await cards.updateActiveCardSpeech(selected)
    }
    const expectedDefaults = structuredClone(toRaw(cards.moduleDefaults))
    voices.resolve(Response.json({
      voices: [
        { id: 'airi-girl', name: 'AIRI Girl', languages: [] },
        { id: 'saved-voice', name: 'Saved voice', languages: [] },
      ],
      recommended: { en: 'airi-girl' },
    }))
    await completion
    await expect.poll(() => leader.speech.isLoadingSpeechProviderVoices).toBe(false)
    expect(cards.getModules(cards.activeCardId).speech).toEqual(selected)
    expect(cards.moduleDefaults).toEqual(expectedDefaults)
    if (change === 'character')
      expect(cards.getCard(id)?.extensions.airi.modules.speech).toEqual(initial)
  }
  finally {
    voices.resolve(Response.json({ voices: [] }))
    await completion
  }
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
// ROOT CAUSE:
// Saving the full resolved tuple replaced an inherited provider with an override.
// Discovery must preserve each inherited field when it commits a missing voice.
it('preserves an inherited provider while completing a model override (Issue #2861)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    models: [{ id: 'voice-pack', name: 'Voice pack' }, { id: 'other-pack', name: 'Other pack' }],
    default: 'voice-pack',
    data: [],
    voices: [{ id: 'airi-girl', name: 'AIRI Girl', languages: [{ code: 'en', title: 'English' }] }],
    recommended: { en: 'airi-girl' },
  })))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  const cards = useAiriCardStore(leader.pinia)
  await cards.configureForAuthentication(true)
  await expect.poll(() => cards.getModules('default').speech.voice_id).toBe('airi-girl')
  const defaults = structuredClone(toRaw(cards.moduleDefaults))
  const id = await cards.addCard({
    name: 'Inherited provider',
    version: '1.0',
    description: '',
    extensions: { airi: { modules: { speech: { provider: '', model: 'other-pack', voice_id: '' } } } },
  }, 'scratch')
  await cards.activateCard(id)
  await expect.poll(() => cards.getModules(id).speech.voice_id).toBe('airi-girl')
  expect(cards.getCard(id)?.extensions.airi.modules.speech).toMatchObject({ provider: '', model: 'other-pack', voice_id: 'airi-girl' })
  expect(cards.moduleDefaults).toEqual(defaults)
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
it.each(['official-provider-speech', 'official-provider-speech-streaming'])('resolves %s without changing runtime selection (Issue #2861)', async (provider) => {
  localStorage.clear()
  const model = provider.endsWith('streaming') ? 'volcengine/seed-tts-2.0' : 'voice-pack'
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    available: true,
    models: [{ id: model, name: 'Speech model' }],
    default: model,
    data: [],
    voices: [{ id: 'voice-a', name: 'Voice A', languages: [{ code: 'en', title: 'English' }] }],
    recommended: { en: 'voice-a' },
  })))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, {})
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  await useAiriCardStore(leader.pinia).initialize()
  const selection = await leader.speech.resolveSelection({ provider, model: '', voice_id: '' })
  expect(selection).toEqual({ provider, model, voice_id: 'voice-a' })
  expect(leader.speech.activeSpeechProvider).toBe('speech-noop')
  expect(leader.speech.activeSpeechModel).toBe('')
  expect(leader.speech.activeSpeechVoiceId).toBe('')
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
it('shows a configuration error and retries through the same commit command (Issue #2861)', async () => {
  localStorage.clear()
  let available = false
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.includes('voices') && !available)
      return new Response('Voice service unavailable', { status: 503 })
    return Response.json({
      models: [{ id: 'voice-pack', name: 'Voice pack' }],
      default: 'voice-pack',
      data: [],
      voices: [{ id: 'voice-a', name: 'Voice A', languages: [{ code: 'en', title: 'English' }] }],
      recommended: { en: 'voice-a' },
    })
  }))
  const namespace = crypto.randomUUID()
  const leader = mountRenderer(namespace)
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  const provider = 'official-provider-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, {})
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  const follower = mountRenderer(namespace, SpeechSettings)
  await expect.poll(() => follower.container.querySelector('input[value="official-provider-speech"]')).not.toBeNull()
  follower.container.querySelector<HTMLInputElement>('input[value="official-provider-speech"]')!.click()
  await expect.poll(() => follower.container.querySelector('[data-speech-state="error"]')?.textContent).toContain('Voice service unavailable')
  expect(follower.container.querySelector('[role="status"]')?.textContent).toContain('Text chat is still available')
  expect(useAiriCardStore(leader.pinia).getModules('default').speech.voice_id).toBe('')
  available = true
  follower.container.querySelector<HTMLButtonElement>('[role="status"] button')!.click()
  await expect.poll(() => follower.container.querySelector('[data-speech-state="ready"]')?.textContent).toContain('voice-pack')
  expect(useAiriCardStore(follower.pinia).getModules('default').speech.voice_id).toBe('voice-a')
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
it('keeps provider and model inherited after a manual voice edit (Issue #2861)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
    models: [{ id: 'voice-pack', name: 'Voice pack' }],
    default: 'voice-pack',
    data: [],
    voices: [{ id: 'voice-a', name: 'Voice A', languages: [] }],
    recommended: { en: 'voice-a' },
  })))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  authenticate(leader.pinia)
  const cards = useAiriCardStore(leader.pinia)
  await cards.configureForAuthentication(true)
  await expect.poll(() => cards.getModules('default').speech.voice_id).toBe('voice-a')
  const defaults = structuredClone(toRaw(cards.moduleDefaults))
  await cards.updateActiveCardSpeech({ voice_id: 'my-voice' })
  expect(cards.activeCard?.extensions.airi.modules.speech).toMatchObject({ provider: '', model: '', voice_id: 'my-voice' })
  expect(cards.getModules('default').speech).toEqual({ provider: 'official-provider-speech', model: 'voice-pack', voice_id: 'my-voice' })
  expect(cards.moduleDefaults).toEqual(defaults)
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
it('leaves third-party voices incomplete until the user selects one (Issue #2861)', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [{ voice_id: 'suggested', name: 'Suggested' }], data: [] })))
  const namespace = crypto.randomUUID()
  const leader = mountRenderer(namespace)
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  await useProviderConfigStore(leader.pinia).ensureProvider('elevenlabs', 'elevenlabs', { apiKey: 'fixture' })
  await useProviderStore(leader.pinia).forceProviderConfigured('elevenlabs')
  const cards = useAiriCardStore(leader.pinia)
  await cards.initialize()
  await cards.updateActiveCardSpeech({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: '' })
  const follower = mountRenderer(namespace, SpeechSettings)
  await expect.poll(() => follower.container.querySelector('[data-speech-state="incomplete"]')).not.toBeNull()
  expect(cards.getModules('default').speech.voice_id).toBe('')
  expect(follower.container.querySelector('[role="status"]')?.textContent).toContain('Text chat is still available')
})

// https://github.com/moeru-ai/airi/issues/2861#issuecomment-6095004263
it('captures the session character for output and skips synthesis when incomplete or muted (Issue #2861)', async () => {
  localStorage.clear()
  const requests: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.method === 'POST') {
      requests.push(JSON.parse(String(init.body)))
      return new Response(new Uint8Array([0, 1]))
    }
    return Response.json({ data: [], voices: [] })
  }))
  const leader = mountRenderer(crypto.randomUUID())
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const provider = 'openai-compatible-audio-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, { apiKey: 'fixture', baseUrl: 'https://speech.invalid/v1/' })
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  const cards = useAiriCardStore(leader.pinia)
  await cards.initialize()
  await cards.updateActiveCardSpeech({ provider, model: 'session-model', voice_id: 'session-voice' })
  const context = new AudioContext()
  try {
    const output = { playback: new Playback(new BrowserPlayback(context)) }
    const turn = { sessionId: 'session-a', turnId: 'turn-a' }
    const captured = leader.speech.createOutput(turn, cards.getModules('default').speech, output, context)
    const otherId = await cards.addCard({ name: 'Other', version: '1.0', description: '', extensions: { airi: { modules: { speech: { provider, model: 'other-model', voice_id: 'other-voice' } } } } }, 'scratch')
    await cards.activateCard(otherId)
    const request = { streamId: 'stream', intentId: 'intent', segmentId: 'segment', sequence: 0, text: 'Hello', special: null, reason: 'flush' as const, priority: 0, createdAt: 0 }
    if (!('synthesize' in captured))
      throw new Error('Expected HTTP speech output')
    await captured.synthesize(request, new AbortController().signal)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ model: 'session-model', voice: 'session-voice', input: 'Hello' })
    for (const selection of [{ provider, model: '', voice_id: '' }, { provider: 'speech-noop', model: '', voice_id: '' }]) {
      const silent = leader.speech.createOutput(turn, selection, output, context)
      if (!('synthesize' in silent))
        throw new Error('Expected silent speech output')
      expect(await silent.synthesize(request, new AbortController().signal)).toBeNull()
    }
    expect(requests).toHaveLength(1)
  }
  finally {
    await context.close()
  }
})
