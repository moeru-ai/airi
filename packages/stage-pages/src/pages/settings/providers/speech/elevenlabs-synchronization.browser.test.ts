import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

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
  // The watcher now sends a plain snapshot and reacts only to API-key changes.
  it('loads voices once after a follower API-key update (Issue #2523)', async () => {
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
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await render(ElevenLabsPage, {
      global: {
        plugins: [
          follower.pinia,
          PiniaColada,
          createI18n({ legacy: false, locale: 'en', messages: { en } }),
          router,
        ],
        provide: {
          [injectKeyPiniaSynced as symbol]: follower.runtime,
        },
        directives: { motion: {} },
      },
    })

    const followerConfig = useProviderConfigStore(follower.pinia)
    await vi.waitFor(() => expect(followerConfig.getProviderConfig('elevenlabs')?.apiKey).toBe(''))
    await followerConfig.patchProviderConfig('elevenlabs', { apiKey: 'test-key' })
    await vi.waitFor(() => expect(leader.speechStore.availableVoices.elevenlabs?.[0]?.id).toBe('test-voice'))
    await vi.waitFor(() => expect(useSpeechStore(follower.pinia).availableVoices.elevenlabs?.[0]?.id).toBe('test-voice'))

    await followerConfig.patchProviderConfig('elevenlabs', { model: 'test-model' })
    await vi.waitFor(() => expect(leaderConfig.getProviderConfig('elevenlabs')?.model).toBe('test-model'))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
