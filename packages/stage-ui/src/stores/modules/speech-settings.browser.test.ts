import type { Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechSettings from '../../../../stage-pages/src/pages/settings/modules/speech.vue'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { captureAnalyticsEvent, enableAnalyticsCapture, isAnalyticsAvailableInBuild } from '../../libs/product-signals/client'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useAiriCardStore } from './airi-card'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'

// Analytics delivery is external IO. Exercise the real page and stores while
// recording its outgoing payload instead of sending product events.
vi.mock('../../libs/product-signals/client', { spy: true })

const cleanups: Array<() => void> = []
const initializations: Array<Promise<void>> = []

/** Mounts a real renderer with a separate Pinia and BroadcastChannel runtime. */
function mountRenderer(namespace: string, page?: Component) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership: page ? 'follower-only' : 'leader-only' })
  pinia.use(runtime.plugin)
  const mountedConfiguration = Promise.withResolvers<void>()
  const container = document.createElement('div')
  document.body.append(container)
  // Await the page's first configuration cycle before injecting another transition.
  const observer = new MutationObserver((records) => {
    if (records.some(record => record.attributeName === 'aria-busy' && record.oldValue === 'true')
      && container.querySelector('[role="status"]')?.getAttribute('aria-busy') === 'false') {
      observer.disconnect()
      mountedConfiguration.resolve()
    }
  })
  observer.observe(container, { attributes: true, attributeOldValue: true, attributeFilter: ['aria-busy'], subtree: true })
  const app = createApp({
    setup() {
      useSpeechStore()
      useHearingStore()
      const cards = useAiriCardStore()
      initializations.push(cards.initialize())
      return () => page ? h(page) : null
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
    .use(PiniaColada)
    .use(router)
    .use(MotionPlugin)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .mount(container)
  cleanups.push(() => {
    observer.disconnect()
    app.unmount()
    disposePinia(pinia)
    runtime.dispose()
    container.remove()
  })
  return { configured: mountedConfiguration.promise, app, pinia, runtime, container, speech: useSpeechStore(pinia), cards: useAiriCardStore(pinia) }
}

afterEach(async () => {
  try {
    await Promise.all(initializations.splice(0))
  }
  finally {
    for (const cleanup of cleanups.splice(0).reverse())
      cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})

// https://github.com/moeru-ai/airi/actions/runs/34348745853/job/102456521103
// ROOT CAUSE: Page initialization and provider watchers awaited model RPCs
// without handling transport disposal. Passing assertions hid a teardown rejection.
it.each(['mount', 'provider change'])('handles interrupted model discovery after %s', async (trigger) => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [], flux: 0 })))
  const namespace = `speech-settings:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
    apiKey: 'key',
    baseUrl: 'https://voices.invalid/v1/',
    region: 'eastasia',
  })
  await leader.cards.updateActiveCardSpeech({ provider: 'speech-noop', model: '', voice_id: '' })
  let completed = 0
  useProviderStore(leader.pinia).$onAction(({ name, after }) => {
    if (name === 'loadModelsForConfiguredProviders')
      after(() => completed++)
  })
  let blocked = 0
  let interrupt = trigger === 'mount'
  const postMessage = BroadcastChannel.prototype.postMessage
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (interrupt && JSON.stringify(message).includes('loadModelsForConfiguredProviders')) {
      blocked++
      return
    }
    postMessage.call(this, message)
  })
  const follower = mountRenderer(namespace, SpeechSettings)
  const globalErrors = vi.fn()
  follower.app.config.errorHandler = globalErrors
  if (trigger === 'provider change') {
    await vi.waitFor(() => expect(completed).toBeGreaterThan(0))
    interrupt = true
    await leader.cards.updateActiveCardSpeech({ provider: 'microsoft-speech', model: 'v1', voice_id: '' })
  }
  await vi.waitFor(() => expect(blocked).toBeGreaterThan(0))
  await Promise.all(initializations)
  follower.runtime.dispose()
  await vi.waitFor(() => expect(globalErrors.mock.calls.length > 0 || follower.container.textContent?.includes('Pinia sync runtime was disposed before the RPC completed.')).toBe(true))
  expect(globalErrors).not.toHaveBeenCalled()
  await vi.waitFor(() => expect(follower.container.textContent).toContain('Pinia sync runtime was disposed before the RPC completed.'))
})

// https://github.com/moeru-ai/airi/pull/2490#discussion_r3964866483
// ROOT CAUSE: The click handler read the old model before the leader RPC
// committed the provider. Analytics must use the completed selection receipt.
it('reports the committed provider and model after a settings-page click', async () => {
  localStorage.clear()
  vi.mocked(captureAnalyticsEvent).mockReset().mockReturnValue(true)
  vi.mocked(enableAnalyticsCapture).mockReturnValue(true)
  vi.mocked(isAnalyticsAvailableInBuild).mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], models: [], flux: 0 })))
  const namespace = `speech-settings:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  await useProviderConfigStore(leader.pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
    apiKey: 'key',
    baseUrl: 'https://voices.invalid/v1/',
    region: 'eastasia',
  })
  await useProviderStore(leader.pinia).forceProviderConfigured('microsoft-speech')
  await leader.cards.updateActiveCardSpeech({ provider: 'speech-noop', model: 'previous-model', voice_id: '' })
  const follower = mountRenderer(namespace, SpeechSettings)
  await vi.waitFor(() => expect(follower.speech.activeSpeechModel).toBe('previous-model'))
  await vi.waitFor(() => expect(follower.container.querySelector('input[value="microsoft-speech"]')).not.toBeNull())
  const input = follower.container.querySelector<HTMLInputElement>('input[value="microsoft-speech"]')!
  input.click()
  await vi.waitFor(() => expect(vi.mocked(captureAnalyticsEvent).mock.calls.filter(([name]) => name === 'tts_provider_selected')).toHaveLength(1))
  expect(captureAnalyticsEvent).toHaveBeenCalledWith('tts_provider_selected', expect.objectContaining({
    tts_provider_id: 'microsoft-speech',
    tts_model_id: 'v1',
    source: 'settings',
  }))
  expect(follower.speech.activeSpeechProvider).toBe('microsoft-speech')
  expect(follower.cards.getModules(follower.cards.activeCardId).speech).toEqual({ provider: 'microsoft-speech', model: 'v1', voice_id: '' })
})

// https://github.com/moeru-ai/airi/pull/2490#discussion_r3967708960
// ROOT CAUSE: Manual input bypassed the guarded computed setter. A rejected
// leader RPC reached Vue's global handler instead of the page error display.
it('shows a manual model transport failure in the settings page', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], data: [] })))
  const namespace = `speech-settings:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const provider = 'openai-compatible-audio-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/' })
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  await leader.cards.updateActiveCardSpeech({ provider, model: 'tts-1', voice_id: 'alloy' })
  const follower = mountRenderer(namespace, SpeechSettings)
  await vi.waitFor(() => expect(follower.container.querySelector('input[placeholder="tts-1"]')).not.toBeNull())
  await follower.configured
  const globalErrors = vi.fn()
  follower.app.config.errorHandler = globalErrors
  const postMessage = BroadcastChannel.prototype.postMessage
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (JSON.stringify(message).includes('configureSpeechSelection'))
      throw new Error('Model selection transport unavailable')
    postMessage.call(this, message)
  })
  const input = follower.container.querySelector<HTMLInputElement>('input[placeholder="tts-1"]')!
  input.value = 'custom-model'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  await expect.poll(() => follower.container.textContent).toContain('Model selection transport unavailable')
  expect(globalErrors).not.toHaveBeenCalled()
  expect(leader.speech.activeSpeechModel).toBe('tts-1')
  expect(leader.cards.getModules(leader.cards.activeCardId).speech.model).toBe('tts-1')
})
