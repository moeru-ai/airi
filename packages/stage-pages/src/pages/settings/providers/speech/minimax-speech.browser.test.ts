import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import MinimaxSpeechPage from './minimax-speech.vue'

import 'virtual:uno.css'

const providerId = 'minimax-speech'

/** The account catalog the stubbed `get_voice` endpoint returns. */
const voiceCatalog = {
  system_voice: [
    { voice_id: 'English_Graceful_Lady', voice_name: 'Graceful Lady' },
    { voice_id: 'Spanish_WiseScholar', voice_name: 'Wise Scholar' },
    { voice_id: 'Chinese (Mandarin)_News_Anchor', voice_name: 'News Anchor' },
  ],
  voice_cloning: [],
  voice_generation: [],
  base_resp: { status_code: 0, status_msg: 'success' },
}

const savedCredentials = { apiKey: 'saved-minimax-key', baseUrl: 'https://api.minimax.io' }

function storeConfiguredProvider(config: Record<string, unknown>) {
  localStorage.setItem('settings/providers/configured', JSON.stringify({
    [providerId]: {
      id: providerId,
      definitionId: providerId,
      config,
      status: 'configured',
      configuredBy: 'user',
    },
  }))
}

function storedConfig() {
  const stored = localStorage.getItem('settings/providers/configured')
  if (!stored)
    return undefined
  return JSON.parse(stored)[providerId]?.config
}

async function renderPage(store: ReturnType<typeof createPinia>) {
  await page.viewport(1100, 1100)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  return await render(MinimaxSpeechPage, {
    global: {
      plugins: [store, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      directives: { motion: {} },
    },
  })
}

/** The playground voice selector, addressed by its field description. */
function voiceSelector() {
  return page.getByRole('combobox', { name: /Select preferred voice/ })
}

/** The selector is a text input whose value holds the selected voice label. */
function voiceLabel(locator: ReturnType<typeof voiceSelector>) {
  return (locator.element() as HTMLInputElement).value
}

describe('minimax speech settings page', () => {
  const stores: Array<ReturnType<typeof createPinia>> = []
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    stores.length = 0
    pinia = createPinia()
    stores.push(pinia)
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(voiceCatalog),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))
  })

  afterEach(() => {
    for (const store of stores)
      disposePinia(store)
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
    storeConfiguredProvider(savedCredentials)

    await renderPage(pinia)

    await expect.poll(() => useSpeechStore(pinia).availableVoices[providerId]?.length, { timeout: 5000 })
      .toBeGreaterThan(0)

    const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(call => String(call[0]))

    expect(requestedUrls.some(url => url.includes('/v1/get_voice'))).toBe(true)
  })

  // ROOT CAUSE:
  //
  // The settings page wrote the credentials but never validated them. The
  // status stayed `unconfigured`, and the module filter dropped the provider.
  //
  // The user edit is the explicit validation trigger. The MiniMax validator
  // only checks that the key is not empty, so the test needs no network.
  it('marks the provider configured after the user enters a valid API key', async () => {
    storeConfiguredProvider({ ...savedCredentials, apiKey: '' })

    await renderPage(pinia)

    await page.getByPlaceholder('API Key').fill('user-entered-key')

    await expect.poll(() => storedConfig()?.apiKey, { timeout: 4000 }).toBe('user-entered-key')
    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)[providerId]?.status
    }, { timeout: 4000 }).toBe('configured')
  })

  // ROOT CAUSE:
  //
  // `SpeechPlayground` owned the picked voice in a local ref with no selection
  // binding. A pick changed the preview request only, so nothing was saved and
  // a reopened page fell back to the first entry. The page now binds the
  // playground to the persisted `configs[providerId].voice`.
  it('keeps a picked voice after the page is reopened', async () => {
    storeConfiguredProvider(savedCredentials)

    const screen = await renderPage(pinia)

    await expect.poll(() => useSpeechStore(pinia).availableVoices[providerId]?.length, { timeout: 5000 })
      .toBe(3)

    // A non-default choice, so a fallback to the first entry cannot pass.
    await voiceSelector().click()
    await page.getByText('Wise Scholar').click()

    await expect.poll(() => useProviderConfigStore(pinia).configs[providerId]?.voice, { timeout: 5000 })
      .toBe('Spanish_WiseScholar')
    await expect.poll(() => storedConfig()?.voice, { timeout: 5000 }).toBe('Spanish_WiseScholar')

    // A fresh store proves the choice came back from storage, not from memory.
    screen.unmount()
    const reopened = createPinia()
    stores.push(reopened)
    const restored = await renderPage(reopened)

    await expect.poll(() => useSpeechStore(reopened).availableVoices[providerId]?.length, { timeout: 5000 })
      .toBe(3)
    await expect.poll(() => voiceLabel(restored.getByRole('combobox', { name: /Select preferred voice/ })), { timeout: 5000 })
      .toContain('Wise Scholar')
  }, 30_000)

  // A voice the catalog no longer lists cannot be synthesized. The selection
  // must fall back instead of leaving a request with an ID the API rejects.
  it('falls back to a listed voice when the saved one is gone', async () => {
    storeConfiguredProvider({ ...savedCredentials, voice: 'Spanish_Serene_Woman' })

    const screen = await renderPage(pinia)

    await expect.poll(() => useSpeechStore(pinia).availableVoices[providerId]?.length, { timeout: 5000 })
      .toBe(3)

    await expect.poll(() => voiceLabel(screen.getByRole('combobox', { name: /Select preferred voice/ })), { timeout: 5000 })
      .toContain('Graceful Lady')
    await expect.poll(() => storedConfig()?.voice, { timeout: 5000 }).toBe('English_Graceful_Lady')
  }, 30_000)
})
