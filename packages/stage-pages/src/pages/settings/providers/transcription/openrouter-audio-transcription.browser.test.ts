import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import OpenRouterAudioTranscriptionPage from './openrouter-audio-transcription.vue'

import 'virtual:uno.css'

const providerId = 'openrouter-audio-transcription'

function storeConfiguredProvider(model?: string) {
  localStorage.setItem('settings/providers/configured', JSON.stringify({
    [providerId]: {
      id: providerId,
      definitionId: providerId,
      config: { apiKey: 'test-key', baseUrl: 'https://openrouter.ai/api/v1', ...(model ? { model } : {}) },
      status: 'configured',
      configuredBy: 'user',
    },
  }))
}

async function renderPage(pinia: ReturnType<typeof createPinia>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()

  return await render(OpenRouterAudioTranscriptionPage, {
    global: {
      plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
      directives: { motion: {} },
    },
  })
}

describe('openRouter audio transcription settings', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      data: [{ id: 'openai/whisper-large-v3', name: 'Whisper Large V3' }],
    })))
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('reloads models when the base URL changes', async () => {
    storeConfiguredProvider()
    await renderPage(pinia)

    await expect.poll(() => vi.mocked(globalThis.fetch).mock.calls.length).toBe(1)
    await page.getByRole('textbox', { name: 'Base URL' }).fill('https://openrouter.example/v1')

    await expect.poll(() => vi.mocked(globalThis.fetch).mock.calls.length).toBe(2)
    const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => String(input))
    expect(requestedUrls).toEqual([
      'https://openrouter.ai/api/v1/models?output_modalities=transcription',
      'https://openrouter.example/v1/models?output_modalities=transcription',
    ])
  })

  it('shows the localized missing-model error in the real transcription playground', async () => {
    storeConfiguredProvider()
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ data: [] })))
    await renderPage(pinia)

    await expect.element(page.getByPlaceholder('API Key')).toBeVisible()
    await expect.element(page.getByRole('combobox', { name: /Model ID/ })).toBeVisible()
    await expect.element(page.getByText('Transcription Playground')).toBeVisible()
    await page.getByRole('button', { name: /Start/ }).click()
    await page.getByRole('button', { name: /Finish/ }).click()

    await expect.element(page.getByText('Select a model in OpenRouter settings before testing.')).toBeVisible()
  })

  it('clears stale models and hides the selector when a catalog refresh fails', async () => {
    storeConfiguredProvider('openai/whisper-large-v3')
    await renderPage(pinia)
    const providersStore = useProviderStore(pinia)
    const errorMessage = 'OpenRouter transcription model list request failed: 401 Invalid API key'
    await expect.poll(() => providersStore.getModelsForProvider(providerId).length).toBe(1)
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error(errorMessage))

    await providersStore.fetchModelsForProvider(providerId)

    expect(providersStore.getModelsForProvider(providerId)).toEqual([])
    expect(providersStore.getDefaultModelForProvider(providerId)).toBeNull()
    expect(localStorage.getItem('settings/providers/configured')).toContain('"model":"openai/whisper-large-v3"')
    expect(page.getByRole('combobox', { name: /Model ID/ }).query()).toBeNull()
    await expect.element(page.getByText(errorMessage)).toBeVisible()
  })
})
