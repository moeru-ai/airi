import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CometApiSpeechPage from './comet-api-speech.vue'
import OpenAICompatibleSpeechPage from './openai-compatible-audio-speech.vue'

import 'virtual:uno.css'

const providerId = 'openai-compatible-audio-speech'

describe('speech provider configuration persistence', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    // The form must accept credentials before a TTS server is reachable.
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('TTS server unavailable')
    }))
  })

  async function renderPage(component = OpenAICompatibleSpeechPage) {
    await page.viewport(1100, 1100)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    return await render(component, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: { motion: {} },
      },
    })
  }

  afterEach(() => {
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // ROOT CAUSE:
  //
  // The immediate model watcher creates an entry in the computed configs map.
  // initializeProvider sees that entry and skips creation of the persisted provider.
  // Input changes then mutate a plain object, so the playground keeps its cached
  // missing-key state and localStorage stays empty. These tests fail if the page
  // and initialization flow stop writing through the provider store.
  // https://github.com/moeru-ai/airi/issues/2449
  it('enables Test Voice after the user enters an API key (Issue #2449)', async () => {
    const screen = await renderPage()

    const testVoice = screen.getByRole('button', { name: 'Test Voice', exact: true })
    await expect.element(testVoice).toBeDisabled()
    await page.getByPlaceholder('sk-...').fill('issue-2449-test-key')
    await expect.element(testVoice, { timeout: 1500 }).toBeEnabled()
    await expect.element(screen.getByText('Please enter an API key to test the voice.')).not.toBeInTheDocument()
    expect(useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('persists a key entered on a fresh settings page (Issue #2449)', async () => {
    await renderPage()
    await page.getByPlaceholder('sk-...').fill('issue-2449-test-key')

    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)[providerId]?.config?.apiKey
    }, { timeout: 2000 }).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449#issuecomment-5586964144
  it('accepts the reported workaround with a persisted provider (Issue #2449)', async () => {
    localStorage.setItem('settings/providers/configured', JSON.stringify({
      [providerId]: {
        id: providerId,
        definitionId: providerId,
        config: { apiKey: 'issue-2449-test-key', baseUrl: 'http://127.0.0.1:8080/v1/', model: 'qwen', voice: 'assistant' },
        status: 'unconfigured',
        configuredBy: 'user',
      },
    }))
    const screen = await renderPage()
    await expect.element(screen.getByRole('button', { name: 'Test Voice', exact: true })).toBeEnabled()
    expect(useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('enables Comet API Test Voice after the user enters an API key (Issue #2449)', async () => {
    const screen = await renderPage(CometApiSpeechPage)

    const testVoice = screen.getByRole('button', { name: 'Test Voice', exact: true })
    await expect.element(testVoice).toBeDisabled()
    await page.getByPlaceholder('API Key').fill('issue-2449-comet-key')
    await expect.element(testVoice, { timeout: 1500 }).toBeEnabled()
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('persists a Comet API key entered on a fresh settings page (Issue #2449)', async () => {
    await renderPage(CometApiSpeechPage)
    await page.getByPlaceholder('API Key').fill('issue-2449-comet-key')

    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)['comet-api-speech']?.config?.apiKey
    }, { timeout: 2000 }).toBe('issue-2449-comet-key')
  })
})
