import en from '@proj-airi/i18n/locales/en'
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
