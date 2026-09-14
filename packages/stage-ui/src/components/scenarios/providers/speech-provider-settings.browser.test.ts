import type { LeadershipMode } from 'pinia-plugin-synced'

import type { ProviderValidationStatus } from '../../../libs/providers/types'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechProviderSettings from './speech-provider-settings.vue'

import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'
import { useSettingsPersistenceStore } from '../../../stores/settings-persistence'

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 3000 })
  pinia.use(runtime.plugin)
  const app = createApp({
    setup() {
      useProviderStore()
      useSpeechStore()
      return () => null
    },
  })
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .use(PiniaColada)
    .mount(document.createElement('div'))
  onTestFinished(() => {
    app.unmount()
    runtime.dispose()
    disposePinia(pinia)
  })
  return { pinia, runtime, config: useProviderConfigStore(pinia), providers: useProviderStore(pinia) }
}

async function mountSettings(providerId: string, status: ProviderValidationStatus = 'unconfigured') {
  const namespace = `speech-settings:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const follower = createContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  await leader.providers.initializeProvider(providerId)
  await leader.config.patchProviderConfig(providerId, {
    ...(providerId === 'voicevox' ? {} : { apiKey: 'original-key' }),
    baseUrl: 'http://localhost:50021/',
    voiceSettings: { pitch: 0, speed: 0.5, volume: 1 },
  })
  await leader.config.setProviderStatus(providerId, status)
  await expect.poll(() => follower.config.getProvider(providerId)).toMatchObject({
    status,
    config: { voiceSettings: { speed: 0.5 } },
  })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const screen = await render(SpeechProviderSettings, {
    props: { providerId, hideApiKey: providerId === 'voicevox' },
    global: {
      directives: { motion: {} },
      plugins: [follower.pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en } }), router],
    },
  })
  // Finished hooks run in reverse order: unmount the form before its stores.
  onTestFinished(() => screen.unmount())
  return { leader, follower, screen }
}

describe('speech settings in a follower window', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('Test backend is offline')
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005086401
  // ROOT CAUSE:
  //
  // The form waited for the voice catalog before enabling persistence.
  // Watchers discarded edits made while that request was pending.
  it('saves edits while the configured provider loads its voice catalog', async () => {
    const response = Promise.withResolvers<Response>()
    onTestFinished(() => response.resolve(Response.json([])))
    let requested = false
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('/speakers')) {
        requested = true
        return response.promise
      }
      throw new TypeError('Test backend is offline')
    }))

    const { leader, screen } = await mountSettings('voicevox', 'configured')
    await expect.poll(() => requested).toBe(true)
    await screen.getByTitle('Reset settings').click()
    await expect.poll(() => leader.config.getProviderConfig('voicevox')?.voiceSettings).toMatchObject({ speed: 1 })
    expect(leader.config.getProviderConfig('voicevox')).not.toHaveProperty('apiKey')
  })

  // https://github.com/moeru-ai/airi/pull/2467
  // ROOT CAUSE:
  //
  // Every edit sent the local API key and URL along with voice settings.
  // Resetting voice settings could overwrite newer credentials from the leader.
  it('keeps newer leader fields when the follower resets voice settings', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower, screen } = await mountSettings(providerId)
    await expect.element(screen.getByPlaceholder('API Key', { exact: true })).toHaveValue('original-key')

    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await leader.config.patchProviderConfig(providerId, {
      apiKey: 'new-key',
      baseUrl: 'https://new.example/v1/',
      model: 'tts-1-hd',
    })
    await expect.poll(() => follower.config.getProviderConfig(providerId)?.apiKey).toBe('new-key')
    // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005472727
    // Store replication must also update the visible input.
    await expect.element(screen.getByPlaceholder('API Key', { exact: true })).toHaveValue('new-key')
    // A snapshot must not turn into a settings RPC after the debounce interval.
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(traffic).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'onCall',
      rest: expect.arrayContaining([expect.objectContaining({ actionName: 'patchProviderConfig' })]),
    }))
    await screen.getByTitle('Reset settings').click()
    await expect.poll(() => leader.config.getProviderConfig(providerId)?.voiceSettings).toMatchObject({ speed: 1 })
    expect(leader.config.getProviderConfig(providerId)?.apiKey).toBe('new-key')
    expect(leader.config.getProviderConfig(providerId)?.baseUrl).toBe('https://new.example/v1/')
    expect(leader.config.getProviderConfig(providerId)?.model).toBe('tts-1-hd')
    await expect.poll(() => follower.config.getProviderConfig(providerId)?.voiceSettings).toMatchObject({ speed: 1 })
    expect(traffic).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'onCall',
      rest: expect.arrayContaining(['replaceState']),
    }))
  })

  it('combines credential and voice edits made in one debounce interval', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')

    await key.fill('edited-key')
    await screen.getByRole('button', { name: /Advanced/i }).click()
    await screen.getByPlaceholder('https://api.openai.com/v1/', { exact: true }).fill('https://edited.example/v1/')
    await screen.getByTitle('Reset settings').click()

    await expect.poll(() => leader.config.getProviderConfig(providerId)).toMatchObject({
      apiKey: 'edited-key',
      baseUrl: 'https://edited.example/v1/',
      voiceSettings: { speed: 1 },
    })
  })
  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005368133
  // ROOT CAUSE:
  //
  // The queue removed the patch before the RPC succeeded. A later voice edit
  // recovered the promise chain but lost the failed credential edit.
  it('retains failed credential edits when a later voice edit saves', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const postMessage = BroadcastChannel.prototype.postMessage
    let rejected = false
    vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
      if (!rejected && JSON.stringify(message).includes('"actionName":"patchProviderConfig"')) {
        rejected = true
        throw new Error('Settings transport is unavailable')
      }
      return postMessage.call(this, message)
    })
    await key.fill('retry-key')
    await expect.poll(() => rejected).toBe(true)
    await expect.poll(() => error.mock.calls.length).toBe(1)
    await screen.getByTitle('Reset settings').click()
    await expect.poll(() => leader.config.getProviderConfig(providerId)?.voiceSettings).toMatchObject({ speed: 1 })
    expect(leader.config.getProviderConfig(providerId)?.apiKey).toBe('retry-key')
  })

  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005368125
  // ROOT CAUSE:
  //
  // Renderer shutdown discarded the pending debounce. The close handshake now
  // flushes and awaits the leader write before it destroys the follower.
  it('does not lose an edit when the follower closes before the debounce', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')
    await key.fill('close-key')
    // The main-process close handler waits for this renderer save barrier.
    await useSettingsPersistenceStore(follower.pinia).flush()
    // Destroy the follower transport only after the close acknowledgement.
    screen.unmount()
    follower.runtime.dispose()
    await expect.poll(() => leader.config.getProviderConfig(providerId)?.apiKey).toBe('close-key')
  })

  it('keeps unsaved input while other fields receive a snapshot', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')
    await key.fill('local-key')
    await leader.config.patchProviderConfig(providerId, {
      apiKey: 'remote-key',
      baseUrl: 'https://remote.example/v1/',
    })
    await expect.poll(() => follower.config.getProviderConfig(providerId)?.apiKey).toBe('remote-key')
    await expect.element(key).toHaveValue('local-key')
    await screen.getByRole('button', { name: /Advanced/i }).click()
    await expect.element(screen.getByPlaceholder('https://api.openai.com/v1/', { exact: true })).toHaveValue('https://remote.example/v1/')
    await useSettingsPersistenceStore(follower.pinia).flush()
    expect(leader.config.getProviderConfig(providerId)?.apiKey).toBe('local-key')
    expect(leader.config.getProviderConfig(providerId)?.baseUrl).toBe('https://remote.example/v1/')
  })
  it('drains newer edits after an in-flight write without reverting the input', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')

    const postMessage = BroadcastChannel.prototype.postMessage
    let release: (() => void) | undefined
    vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(function (this: BroadcastChannel, message) {
      if (!release && JSON.stringify(message).includes('"actionName":"patchProviderConfig"')) {
        release = () => postMessage.call(this, message)
        return
      }
      return postMessage.call(this, message)
    })
    await key.fill('first-key')
    await expect.poll(() => release).toBeDefined()
    await key.fill('latest-key')
    const saved = useSettingsPersistenceStore(follower.pinia).flush()
    release?.()
    await saved
    expect(leader.config.getProviderConfig(providerId)?.apiKey).toBe('latest-key')
    await expect.element(key).toHaveValue('latest-key')
  })

  it('keeps the save barrier alive when the form unmounts during a write', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower, screen } = await mountSettings(providerId)
    const key = screen.getByPlaceholder('API Key', { exact: true })
    await expect.element(key).toHaveValue('original-key')
    await key.fill('unmount-key')
    screen.unmount()
    await useSettingsPersistenceStore(follower.pinia).flush()
    follower.runtime.dispose()
    expect(leader.config.getProviderConfig(providerId)?.apiKey).toBe('unmount-key')
  })
})
