import type { InferenceServiceProvider } from '../../../libs/providers/types'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import SpeechProviderSettings from './speech-provider-settings.vue'

import { useProviderConfigStore } from '../../../stores/providers/config'

function installProviderStore() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada)
  setActivePinia(pinia)
  return pinia
}

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
}

describe('speech provider settings', () => {
  it('issue #2447: persists reset voice settings through the provider store', async () => {
    // https://github.com/moeru-ai/airi/issues/2447
    // ROOT CAUSE:
    //
    // The component replaced an entry in the derived `configs` computed value.
    // The replacement never reached the store-owned provider configuration.
    //
    // The reset action replaces `voiceSettings`, so it exercises the same path
    // as changing a model or voice in the provider settings page.
    const pinia = installProviderStore()
    const store = useProviderConfigStore()
    const provider = {
      id: 'openai-audio-speech',
      definitionId: 'openai-audio-speech',
      config: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1/',
        voiceSettings: { speed: 0.5 },
      },
      status: 'unconfigured',
      configuredBy: 'user',
    } satisfies InferenceServiceProvider
    store.providers[provider.id] = provider

    const screen = await render(SpeechProviderSettings, {
      props: { providerId: provider.id },
      global: {
        directives: { motion: {} },
        plugins: [pinia, PiniaColada, createTestI18n(), createTestRouter()],
      },
    })

    await screen.getByTitle('Reset settings').click()

    await expect.poll(() => store.providers[provider.id]?.config.voiceSettings).toEqual({
      pitch: 0,
      speed: 1,
      volume: 0,
    })
    expect(store.providers[provider.id]?.config.apiKey).toBe('sk-test')
  })
})
