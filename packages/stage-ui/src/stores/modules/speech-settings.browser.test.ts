import type { Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { MotionPlugin } from '@vueuse/motion'
import { generateSpeech } from '@xsai/generate-speech'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
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
vi.mock('@xsai/generate-speech', { spy: true })

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

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// None replaced the selected speech configuration. The source action now retains it and commits activation in the leader.
it.each(['provider', 'switch'] as const)('issue #3153: disables speech with the %s control from a follower and restores the saved model and voice', async (control) => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], data: [] })))
  const namespace = `speech-disabled:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const provider = 'openai-compatible-audio-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/' })
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  await leader.speech.selectProviderModel(provider, 'tts-1', 'alloy')
  const follower = mountRenderer(namespace, SpeechSettings)
  await vi.waitFor(() => expect(follower.speech.activeSpeechVoiceId).toBe('alloy'))
  const view = page.elementLocator(follower.container)
  const toggle = view.getByRole('switch', { name: 'Speech', exact: true })
  const none = view.getByRole('radio', { name: 'None', exact: true })
  await expect.element(toggle).toBeChecked()
  if (control === 'switch')
    await toggle.click()
  else
    await page.elementLocator(none.element().closest('label')!).click()
  await vi.waitFor(() => expect(leader.speech.enabled).toBe(false))
  expect(leader.speech.configured).toBe(false)
  expect(leader.speech.activeSpeechProvider).toBe(provider)
  expect(leader.speech.activeSpeechModel).toBe('tts-1')
  expect(leader.speech.activeSpeechVoiceId).toBe('alloy')
  // The leader commits before the follower renders its snapshot. Wait for the
  // displayed state before clicking a radio that was previously selected.
  await expect.element(toggle).not.toBeChecked()
  await expect.element(none).toBeChecked()
  if (control === 'switch') {
    await toggle.click()
  }
  else {
    const savedProvider = follower.container.querySelector<HTMLInputElement>(`input[value="${provider}"]`)!
    await expect.element(page.elementLocator(savedProvider)).not.toBeChecked()
    await page.elementLocator(savedProvider.closest('label')!).click()
  }
  await vi.waitFor(() => expect(leader.speech.enabled).toBe(true))
  await expect.element(toggle).toBeChecked()
  expect(follower.speech.activeSpeechProvider).toBe(provider)
  expect(leader.speech.activeSpeechModel).toBe('tts-1')
  expect(leader.speech.activeSpeechVoiceId).toBe('alloy')
})

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// The preview bypassed module cancellation. Disabling now aborts its request and rejects late audio.
it('issue #3153: cancels a speech preview when another window disables speech', async () => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ voices: [], data: [] })))
  const pending = Promise.withResolvers<ArrayBuffer>()
  vi.mocked(generateSpeech).mockReturnValue(pending.promise)
  const namespace = `speech-preview-disabled:${crypto.randomUUID()}`
  const leader = mountRenderer(namespace)
  await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
  const provider = 'openai-compatible-audio-speech'
  await useProviderConfigStore(leader.pinia).ensureProvider(provider, provider, { apiKey: 'key', baseUrl: 'https://voices.invalid/v1/' })
  await useProviderStore(leader.pinia).forceProviderConfigured(provider)
  await leader.speech.selectProviderModel(provider, 'tts-1', 'alloy')
  const follower = mountRenderer(namespace, SpeechSettings)
  const preview = () => Array.from(follower.container.querySelectorAll('button')).find(button => button.textContent?.includes('Test Voice'))!
  await vi.waitFor(() => expect(preview()?.disabled).toBe(false))
  preview().click()
  await vi.waitFor(() => expect(generateSpeech).toHaveBeenCalledTimes(1))
  const signal = vi.mocked(generateSpeech).mock.calls[0][0].abortSignal
  await leader.speech.selectSource('speech-noop')
  await vi.waitFor(() => expect(signal?.aborted).toBe(true))
  pending.resolve(new ArrayBuffer(0))
  await vi.waitFor(() => expect(preview()?.disabled).toBe(true))
  expect(follower.container.querySelector('audio')).toBeNull()
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
  await leader.speech.selectProviderModel('speech-noop', '')
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
    await leader.speech.selectProviderModel('microsoft-speech', 'v1')
  }
  await vi.waitFor(() => expect(blocked).toBeGreaterThan(0))
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
  await vi.waitFor(() => expect(follower.speech.activeSpeechProvider).toBe('microsoft-speech'))
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
