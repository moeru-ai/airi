import type { Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
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
      void cards.initialize()
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

afterEach(() => {
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
    follower.container.querySelector<HTMLInputElement>('input[value="official-provider-speech"]')!.click()
    await vi.waitFor(() => expect(cards.activeCard?.extensions.airi.modules.speech.provider).toBe(provider))
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
    await cards.completeSpeechSelection(cards.activeCardId)
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
  const completion = cards.completeSpeechSelection(id)
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
