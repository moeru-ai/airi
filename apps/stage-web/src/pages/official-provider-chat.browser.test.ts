import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { ProviderGenerationSettings } from '@proj-airi/stage-ui/components'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import 'virtual:uno.css'

async function renderSettings() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const screen = await render(ProviderGenerationSettings, {
    props: { providerId: 'official-provider' },
    global: {
      plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })

  const configStore = useProviderConfigStore(pinia)
  configStore.ensureProvider('official-provider', 'official-provider', { api: 'responses' })

  return { configStore, screen }
}

describe('official chat provider settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists the selected API protocol', async () => {
    const { configStore, screen } = await renderSettings()

    await expect.element(screen.getByText('API protocol', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('combobox')).toHaveValue('Responses API')

    await screen.getByRole('combobox').click()
    await screen.getByRole('option', { name: 'Chat Completions' }).click()

    await expect.poll(() => configStore.getProviderConfig('official-provider')?.api).toBe('chat-completions')
  })
})
