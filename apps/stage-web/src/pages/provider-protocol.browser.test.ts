import en from '@proj-airi/i18n/locales/en'
import ChatProviderPage from '@proj-airi/stage-pages/pages/settings/providers/chat/[providerId].vue'
import VisionProviderPage from '@proj-airi/stage-pages/pages/settings/providers/vision/[providerId].vue'
import ProviderEditor from '@proj-airi/stage-pages/pages/v2/settings/providers/edit/[providerId]/index.vue'

import { PiniaColada } from '@pinia/colada'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import 'virtual:uno.css'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

it('opens a configured provider protocol selector without an initialization error', async () => {
  // ROOT CAUSE:
  // The immediate validation watcher called getValidationPlan before its
  // request counter was initialized. Initialize the counter before the watcher.
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/providers/:providerId', name: '/v2/settings/providers/edit/[providerId]/', component: ProviderEditor }],
  })
  createApp({}).use(pinia).use(PiniaColada)
  useProviderConfigStore(pinia).ensureProvider('openai', 'openai', {
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1/',
  })
  await router.push('/providers/openai')
  await router.isReady()
  const errors: unknown[] = []
  const result = await render(ProviderEditor, {
    global: {
      config: { errorHandler: error => errors.push(error) },
      directives: { motion: {} },
      plugins: [
        pinia,
        PiniaColada,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
        router,
      ],
    },
  })
  await router.isReady()
  await expect.element(result.getByRole('combobox')).toHaveValue('Responses API')
  const search = result.getByRole('switch', { name: /Web search/ })
  await expect.element(search).not.toBeChecked()
  await search.click()
  await expect.element(search).toBeChecked()
  await search.click()
  await expect.element(search).not.toBeChecked()
  await result.getByRole('combobox').click()
  await result.getByRole('option', { name: 'Chat Completions', exact: true }).click()
  await expect.element(search).toBeDisabled()
  await result.getByRole('combobox').click()
  await result.getByRole('option', { name: 'Responses API', exact: true }).click()
  await expect.element(search).not.toBeChecked()
  expect(errors).toEqual([])
})

// The real settings pages initialize providers and update persisted config in place.
async function openSettings(category: 'chat' | 'vision', definitionId = 'openai') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const component = category === 'chat' ? ChatProviderPage : VisionProviderPage
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: `/settings/providers/${category}/:providerId`, name: `/settings/providers/${category}/[providerId]`, component }],
  })
  createApp({}).use(pinia).use(PiniaColada)
  const store = useProviderConfigStore(pinia)
  const id = category === 'chat' ? definitionId : `vision-${definitionId}`
  store.ensureProvider(id, definitionId, { apiKey: '', baseUrl: 'https://api.openai.com/v1/' })
  await router.push(`/settings/providers/${category}/${definitionId}`)
  await router.isReady()
  const errors: unknown[] = []
  const page = await render(component, {
    global: {
      config: { errorHandler: error => errors.push(error) },
      plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en } }), router],
    },
  })
  return { page, store, id, errors }
}

// https://github.com/moeru-ai/airi/issues/2478
it.each(['chat', 'vision'] as const)('issue #2478 exposes generation settings on the active %s provider page', async (category) => {
  // ROOT CAUSE:
  // The previous test mounted the V2 editor, while settings links to the chat
  // and vision pages. These pages never rendered the catalog generation fields.
  const { page, store, id, errors } = await openSettings(category)
  await expect.element(page.getByRole('combobox')).toHaveValue('Responses API')
  const search = page.getByRole('switch', { name: /Web search/ })
  await expect.element(search).not.toBeChecked()
  await search.click()
  await expect.element(search).toBeChecked()
  await search.click()
  await expect.element(search).not.toBeChecked()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Chat Completions', exact: true }).click()
  await expect.element(search).toBeDisabled()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Responses API', exact: true }).click()
  await expect.element(search).not.toBeChecked()
  expect(store.getProviderConfig(id)).toMatchObject({ api: 'responses', webSearch: false })
  // Changing the endpoint must apply catalog availability without overwriting
  // the user's explicit search preference.
  store.getProviderConfig(id).baseUrl = 'https://example.com/v1/'
  await expect.element(search).toBeDisabled()
  expect(store.getProviderConfig(id).webSearch).toBe(false)
  expect(errors).toEqual([])
})

it('issue #2478 lets compatible providers opt into Responses without native search', async () => {
  const { page, store, id, errors } = await openSettings('chat', 'openai-compatible')
  await expect.element(page.getByRole('combobox')).toHaveValue('Chat Completions')
  await expect.element(page.getByRole('switch', { name: /Web search/ })).not.toBeInTheDocument()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Responses API', exact: true }).click()
  expect(store.getProviderConfig(id)).toMatchObject({ api: 'responses' })
  expect(errors).toEqual([])
})
