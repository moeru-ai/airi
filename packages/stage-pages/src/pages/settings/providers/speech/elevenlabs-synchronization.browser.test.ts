import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App, Component } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { injectKeyPiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ElevenLabsPage from './elevenlabs.vue'
import VolcenginePage from './volcengine.vue'

import 'virtual:uno.css'

const contexts: Array<{
  app?: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedPinia(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  contexts.push({ pinia, runtime })
  return { pinia, runtime }
}

function mountLeader(namespace: string) {
  const { pinia, runtime } = createSyncedPinia(namespace, 'leader-only')
  let speechStore: ReturnType<typeof useSpeechStore> | undefined
  const app = createApp({
    setup() {
      speechStore = useSpeechStore()
      useProviderConfigStore()
      return () => null
    },
  })
  app
    .provide(injectKeyPiniaSynced, runtime)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .use(PiniaColada)
    .mount(document.createElement('div'))
  contexts.at(-1)!.app = app

  if (!speechStore)
    throw new Error('Speech store did not initialize')

  return { pinia, runtime, speechStore }
}

async function mountFollower(component: Component, pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await render(component, {
    global: {
      plugins: [
        pinia,
        PiniaColada,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
        router,
      ],
      provide: {
        [injectKeyPiniaSynced as symbol]: runtime,
      },
      directives: { motion: {} },
    },
  })
}

afterEach(() => {
  for (const { app, pinia, runtime } of contexts) {
    app?.unmount()
    runtime.dispose()
    disposePinia(pinia)
  }
  contexts.length = 0
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('elevenLabs settings synchronization', () => {
  // https://github.com/moeru-ai/airi/issues/2523
  // ROOT CAUSE:
  //
  // The settings watcher sent a reactive provider configuration through the
  // synchronized validation action. BroadcastChannel rejected that argument
  // before the leader could validate it, so the watcher skipped voice discovery.
  // Watching the complete provider snapshot also repeated discovery when an
  // equivalent snapshot returned from the leader.
  //
  // The watcher now sends a plain snapshot and debounces catalog credential changes.
  it('debounces follower credential changes and reloads for a new base URL (Issue #2523)', async () => {
    localStorage.clear()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      voices: [{
        id: 'test-voice',
        name: 'Test Voice',
        preview_audio_url: 'https://voices.invalid/preview.mp3',
      }],
    }))
    vi.stubGlobal('fetch', fetch)

    const namespace = `elevenlabs:${crypto.randomUUID()}`
    const leader = mountLeader(namespace)
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const leaderConfig = useProviderConfigStore(leader.pinia)
    await leaderConfig.ensureProvider('elevenlabs', 'elevenlabs', {
      apiKey: '',
      baseUrl: 'https://voices.invalid/v1/',
    })

    const follower = createSyncedPinia(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await mountFollower(ElevenLabsPage, follower.pinia, follower.runtime)

    const followerConfig = useProviderConfigStore(follower.pinia)
    await vi.waitFor(() => expect(followerConfig.getProviderConfig('elevenlabs')?.apiKey).toBe(''))
    await followerConfig.patchProviderConfig('elevenlabs', { apiKey: 't' })
    await followerConfig.patchProviderConfig('elevenlabs', { apiKey: 'test' })
    await followerConfig.patchProviderConfig('elevenlabs', { apiKey: 'test-key' })
    await vi.waitFor(() => expect(leader.speechStore.availableVoices.elevenlabs?.[0]?.id).toBe('test-voice'))
    await vi.waitFor(() => expect(useSpeechStore(follower.pinia).availableVoices.elevenlabs?.[0]?.id).toBe('test-voice'))
    expect(fetch).toHaveBeenCalledTimes(1)

    await followerConfig.patchProviderConfig('elevenlabs', { baseUrl: 'https://voices-two.invalid/v1/' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    await followerConfig.patchProviderConfig('elevenlabs', { model: 'test-model' })
    await vi.waitFor(() => expect(leaderConfig.getProviderConfig('elevenlabs')?.model).toBe('test-model'))
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  // https://github.com/moeru-ai/airi/issues/2523
  it('loads Volcengine voices after follower credential changes (Issue #2523)', async () => {
    localStorage.clear()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      voices: [{
        id: 'volcengine-voice',
        name: 'Volcengine Voice',
        preview_audio_url: 'https://voices.invalid/volcengine.mp3',
      }],
    }))
    vi.stubGlobal('fetch', fetch)

    const namespace = `volcengine:${crypto.randomUUID()}`
    const leader = mountLeader(namespace)
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const leaderConfig = useProviderConfigStore(leader.pinia)
    await leaderConfig.ensureProvider('volcengine', 'volcengine', {
      apiKey: '',
      app: { appId: '' },
      baseUrl: 'https://voices.invalid/v1/',
    })

    const follower = createSyncedPinia(namespace, 'follower-only')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    await mountFollower(VolcenginePage, follower.pinia, follower.runtime)

    const followerConfig = useProviderConfigStore(follower.pinia)
    await vi.waitFor(() => expect(followerConfig.getProviderConfig('volcengine')?.apiKey).toBe(''))
    await followerConfig.patchProviderConfig('volcengine', { apiKey: 'test-key' })
    await followerConfig.patchProviderConfig('volcengine', { app: { appId: 'test-app' } })
    await vi.waitFor(() => expect(leader.speechStore.availableVoices.volcengine?.[0]?.id).toBe('volcengine-voice'))
    await vi.waitFor(() => expect(useSpeechStore(follower.pinia).availableVoices.volcengine?.[0]?.id).toBe('volcengine-voice'))
    expect(fetch).toHaveBeenCalledTimes(1)

    await followerConfig.patchProviderConfig('volcengine', { baseUrl: 'https://voices-two.invalid/v1/' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))

    await followerConfig.patchProviderConfig('volcengine', { audio: { speedRatio: 1.25 } })
    await vi.waitFor(() => expect(leaderConfig.getProviderConfig('volcengine')?.audio).toEqual({ speedRatio: 1.25 }))
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
