import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import MinimaxSpeechPage from './minimax-speech.vue'

import 'virtual:uno.css'

const providerId = 'minimax-speech'

const voiceCatalog = {
  system_voice: [
    { voice_id: 'English_Graceful_Lady', voice_name: 'Graceful Lady' },
    { voice_id: 'Spanish_Serene_Woman', voice_name: 'Serene Woman' },
  ],
  voice_cloning: [],
  voice_generation: [],
  base_resp: { status_code: 0, status_msg: 'success' },
}

describe('minimax speech voice catalog on mount', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(voiceCatalog),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // The page must read the account catalog through the get_voice endpoint, so a
  // Spanish voice reaches the selector. A stored key must produce a populated
  // catalog without the user retyping it.
  //
  // This test does not reproduce the empty selector reported by the user. That
  // failure needs a real browser session.
  it('lists the account voices when the key is already saved', async () => {
    localStorage.setItem('settings/providers/configured', JSON.stringify({
      [providerId]: {
        id: providerId,
        definitionId: providerId,
        config: { apiKey: 'saved-minimax-key', baseUrl: 'https://api.minimax.io' },
        status: 'configured',
        configuredBy: 'user',
      },
    }))

    await page.viewport(1100, 1100)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    await render(MinimaxSpeechPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: { motion: {} },
      },
    })

    const speechStore = useSpeechStore(pinia)

    await expect.poll(() => speechStore.availableVoices[providerId]?.length, { timeout: 5000 })
      .toBeGreaterThan(0)

    const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(call => String(call[0]))

    expect(requestedUrls.some(url => url.includes('/v1/get_voice'))).toBe(true)
  })
})
