import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import { OFFICIAL_CHAT_PROVIDER_ID } from '../libs/providers/providers/official'
import { useProviderConfigStore } from '../stores/providers/config'
import { useProviderStore } from '../stores/providers/provider'
import { useProviderGenerationSettings } from './use-provider-generation-settings'
import { useSessionFeatureAvailability } from './use-session-feature-availability'

const cleanups: Array<() => void> = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  localStorage.clear()
})

it('reads native search from the existing provider configuration and preserves source availability', async () => {
  const pinia = createPinia()
  const selectedProvider = ref<string>()
  let settings: ReturnType<typeof useProviderGenerationSettings> | undefined
  let availability: ReturnType<typeof useSessionFeatureAvailability> | undefined
  const app = createApp({ setup() {
    settings = useProviderGenerationSettings(selectedProvider)
    availability = useSessionFeatureAvailability(() => settings!.nativeWebSearch.value)
    return () => null
  } })
  const container = document.createElement('div')
  document.body.append(container)
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en } })).mount(container)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    container.remove()
  })
  const providers = useProviderConfigStore(pinia)
  const instances = vi.spyOn(useProviderStore(pinia), 'getProviderInstance')
  providers.ensureProvider('example-openai', 'openai', { apiKey: 'example-key', api: 'responses', webSearch: false, baseUrl: 'https://api.openai.com/v1' })
  selectedProvider.value = 'example-openai'
  await vi.waitFor(() => expect(settings?.protocol.value).toBe('responses'))
  expect(settings?.nativeWebSearch.value).toBe(false)
  await providers.patchProviderConfig('example-openai', { webSearch: true })
  await vi.waitFor(() => expect(settings?.nativeWebSearch.value).toBe(true))
  expect(availability?.value['tools.web-search'].visible).toBe(true)
  expect(availability?.value['tools.web-search'].blocker).toBeUndefined()
  await providers.patchProviderConfig('example-openai', { api: 'chat-completions' })
  await vi.waitFor(() => expect(settings?.nativeWebSearch.value).toBe(false))
  await providers.patchProviderConfig('example-openai', { api: 'responses', baseUrl: 'https://example.com/v1' })
  await vi.waitFor(() => expect(settings?.searchField.value?.meta()?.disabled).toBe(true))
  expect(settings?.nativeWebSearch.value).toBe(false)
  expect(providers.getProviderConfig('example-openai')?.webSearch).toBe(true)
  providers.ensureProvider('example-official', OFFICIAL_CHAT_PROVIDER_ID, { api: 'responses' })
  selectedProvider.value = 'example-official'
  await vi.waitFor(() => expect(settings?.searchField.value).toBeUndefined())
  await vi.waitFor(() => expect(settings?.nativeWebSearch.value).toBe(true))
  expect(availability?.value['tools.web-search'].blocker).toBeUndefined()
  expect(providers.getProviderConfig('example-official')).toEqual({ api: 'responses' })
  expect(instances).not.toHaveBeenCalled()
  selectedProvider.value = 'missing-provider'
  await vi.waitFor(() => expect(settings?.nativeWebSearch.value).toBe(false))
  await vi.waitFor(() => expect(settings?.schemaError.value).toBeDefined())
})
