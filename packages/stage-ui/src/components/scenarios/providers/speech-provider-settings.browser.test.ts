import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechProviderSettings from './speech-provider-settings.vue'

import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const contexts: Array<{ app: App, pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []
const unmounts: Array<() => void> = []
const releaseRequests: Array<() => void> = []

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 3000 })
  pinia.use(runtime.plugin)
  let stores: {
    config: ReturnType<typeof useProviderConfigStore>
    providers: ReturnType<typeof useProviderStore>
  } | undefined
  const app = createApp({
    setup() {
      stores = {
        config: useProviderConfigStore(),
        providers: useProviderStore(),
      }
      useSpeechStore()
      return () => null
    },
  })
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .use(PiniaColada)
    .mount(document.createElement('div'))
  if (!stores)
    throw new Error('Provider stores did not initialize')
  contexts.push({ app, pinia, runtime })
  return { ...stores, pinia, runtime }
}

async function createRenderers(providerId: string) {
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
  await expect.poll(() => follower.config.getProviderConfig(providerId)?.voiceSettings).toMatchObject({ speed: 0.5 })
  return { leader, follower }
}

async function mountSettings(pinia: ReturnType<typeof createPinia>, providerId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const screen = await render(SpeechProviderSettings, {
    props: { providerId, hideApiKey: providerId === 'voicevox' },
    global: {
      directives: { motion: {} },
      plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en } }), router],
    },
  })
  unmounts.push(() => screen.unmount())
  return screen
}

describe('speech settings in a follower window', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('Test backend is offline')
    }))
  })

  afterEach(() => {
    for (const release of releaseRequests.splice(0))
      release()
    for (const unmount of unmounts.splice(0))
      unmount()
    for (const context of contexts.splice(0)) {
      context.app.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005086401
  // ROOT CAUSE:
  //
  // The form waited for the voice catalog before enabling persistence.
  // A user could edit the visible form while that request was pending.
  // The watchers discarded those edits and never saved them after the request.
  it('saves edits while the configured provider loads its voice catalog', async () => {
    const { leader, follower } = await createRenderers('voicevox')
    await leader.config.setProviderStatus('voicevox', 'configured')
    await expect.poll(() => follower.config.configuredProviders.voicevox).toBe(true)

    let requested = false
    const response = new Promise<Response>((resolve) => {
      releaseRequests.push(() => resolve(Response.json([])))
    })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('/speakers')) {
        requested = true
        return response
      }
      throw new TypeError('Test backend is offline')
    }))

    const screen = await mountSettings(follower.pinia, 'voicevox')
    await expect.poll(() => requested).toBe(true)
    await screen.getByTitle('Reset settings').click()
    await expect.poll(() => leader.config.getProviderConfig('voicevox')?.voiceSettings).toMatchObject({ speed: 1 })
    expect(leader.config.getProviderConfig('voicevox')).not.toHaveProperty('apiKey')
  })

  // https://github.com/moeru-ai/airi/pull/2467
  // ROOT CAUSE:
  //
  // Every form change sent the local API key and URL along with voice settings.
  // A remote snapshot updated the store but left those form drafts unchanged.
  // Resetting the voice settings could therefore restore older credentials.
  it('keeps newer leader fields when the follower resets voice settings', async () => {
    const providerId = 'openai-audio-speech'
    const { leader, follower } = await createRenderers(providerId)
    const screen = await mountSettings(follower.pinia, providerId)
    await expect.element(screen.getByPlaceholder('API Key', { exact: true })).toHaveValue('original-key')

    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await leader.config.patchProviderConfig(providerId, {
      apiKey: 'new-key',
      baseUrl: 'https://new.example/v1/',
      model: 'tts-1-hd',
    })
    await expect.poll(() => follower.config.getProviderConfig(providerId)?.apiKey).toBe('new-key')
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
    const { leader, follower } = await createRenderers(providerId)
    const screen = await mountSettings(follower.pinia, providerId)
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
    await expect.poll(() => follower.config.getProviderConfig(providerId)?.apiKey).toBe('edited-key')
  })
})
