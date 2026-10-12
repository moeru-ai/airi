import type { PropType } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { errorMessageFrom } from '@moeru/std'
import { PiniaColada } from '@pinia/colada'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import OpenRouterAudioTranscriptionPage from './openrouter-audio-transcription.vue'

import 'virtual:uno.css'

const providerId = 'openrouter-audio-transcription'
const fetchCalls: string[] = []

const ProviderSettingsStub = defineComponent({
  props: { providerId: { type: String, required: true } },
  setup(_props, { slots }) {
    return () => h('div', [slots['basic-settings']?.(), slots.playground?.()])
  },
})

const TranscriptionPlaygroundStub = defineComponent({
  props: {
    generateTranscription: {
      type: Function as PropType<(input: File) => Promise<unknown>>,
      required: true,
    },
  },
  setup(props) {
    const errorMessage = ref('')
    async function runTranscription() {
      try {
        await props.generateTranscription(new File([], 'recording.wav'))
      }
      catch (cause) {
        errorMessage.value = errorMessageFrom(cause) ?? 'Unknown error'
      }
    }

    return () => h('div', [
      h('button', { onClick: () => void runTranscription() }, 'Run transcription'),
      h('p', errorMessage.value),
    ])
  },
})

const FieldComboboxStub = defineComponent({
  setup() {
    return () => h('div')
  },
})

const PageHarness = defineComponent({
  setup() {
    const providersStore = useProviderStore()
    providersStore.fetchModelsForProvider = async (requestedProviderId) => {
      fetchCalls.push(requestedProviderId)
      return { models: [] }
    }

    return () => h(OpenRouterAudioTranscriptionPage)
  },
})

function storeConfiguredProvider() {
  localStorage.setItem('settings/providers/configured', JSON.stringify({
    [providerId]: {
      id: providerId,
      definitionId: providerId,
      config: { apiKey: 'test-key', baseUrl: 'https://openrouter.ai/api/v1' },
      status: 'configured',
      configuredBy: 'user',
    },
  }))
}

async function renderPage(pinia: ReturnType<typeof createPinia>, translatedError?: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()

  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  if (translatedError) {
    i18n.global.mergeLocaleMessage('en', {
      settings: {
        pages: {
          modules: {
            hearing: {
              sections: {
                section: {
                  playground: {
                    'select-model-before-testing': translatedError,
                  },
                },
              },
            },
          },
        },
      },
    })
  }

  return await render(PageHarness, {
    global: {
      plugins: [pinia, PiniaColada, router, i18n],
      stubs: {
        TranscriptionProviderSettings: ProviderSettingsStub,
        TranscriptionPlayground: TranscriptionPlaygroundStub,
        FieldCombobox: FieldComboboxStub,
      },
    },
  })
}

describe('openRouter audio transcription settings', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    fetchCalls.length = 0
    pinia = createPinia()
  })

  afterEach(() => {
    disposePinia(pinia)
    localStorage.clear()
  })

  it('reloads models when the base URL changes', async () => {
    storeConfiguredProvider()
    await renderPage(pinia)

    await expect.poll(() => fetchCalls.length).toBe(1)
    const configStore = useProviderConfigStore(pinia)
    configStore.providers[providerId].config.baseUrl = 'https://openrouter.example/v1'

    await expect.poll(() => fetchCalls.length).toBe(2)
    expect(fetchCalls).toEqual([providerId, providerId])
  })
  it('shows the localized error when no model is selected', async () => {
    const translatedError = '[translated:select-model-before-testing]'
    await renderPage(pinia, translatedError)

    await page.getByRole('button', { name: 'Run transcription' }).click()

    await expect.element(page.getByText(translatedError)).toBeVisible()
  })

  it('shows the model catalog error beside the disabled selector', async () => {
    await renderPage(pinia)
    const providersStore = useProviderStore(pinia)
    providersStore.providerRuntimeState = {
      ...providersStore.providerRuntimeState,
      [providerId]: {
        models: [],
        defaultModel: null,
        modelStatus: 'error',
        modelError: 'OpenRouter transcription model list request failed: 401 Invalid API key',
      },
    }

    await expect.element(page.getByRole('combobox')).toBeDisabled()
    await expect.element(page.getByText('OpenRouter transcription model list request failed: 401 Invalid API key')).toBeVisible()
  })
})
