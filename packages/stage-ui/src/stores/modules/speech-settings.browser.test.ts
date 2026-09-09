import type { Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { MotionPlugin } from '@vueuse/motion'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechSettings from '../../../../stage-pages/src/pages/settings/modules/speech.vue'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { captureAnalyticsEvent, enableAnalyticsCapture, isAnalyticsAvailableInBuild } from '../../libs/product-signals/client'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useSpeechStore } from './speech'

// Analytics delivery is external IO. Exercise the real page and stores while
// recording its outgoing payload instead of sending product events.
vi.mock('../../libs/product-signals/client', { spy: true })

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
      return () => page ? h(page) : null
    },
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  app.provide(injectKeyPiniaSynced, runtime)
    .use(pinia)
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

afterEach(() => {
  for (const cleanup of cleanups.splice(0))
    cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
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
  await leader.speech.selectProviderModel('speech-noop', 'previous-model')
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
  await leader.speech.selectProviderModel(provider, 'tts-1')
  const follower = mountRenderer(namespace, SpeechSettings)
  await vi.waitFor(() => expect(follower.container.querySelector('input[placeholder="tts-1"]')).not.toBeNull())
  await new Promise(resolve => setTimeout(resolve, 100))
  const globalErrors = vi.fn()
  follower.app.config.errorHandler = globalErrors
  const postMessage = BroadcastChannel.prototype.postMessage
  vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
    if (JSON.stringify(message).includes('selectProviderModel'))
      throw new Error('Model selection transport unavailable')
    postMessage.call(this, message)
  })
  const input = follower.container.querySelector<HTMLInputElement>('input[placeholder="tts-1"]')!
  input.value = 'custom-model'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(globalErrors).not.toHaveBeenCalled()
  expect(follower.container.textContent).toContain('Model selection transport unavailable')
  expect(leader.speech.activeSpeechModel).toBe('tts-1')
})
