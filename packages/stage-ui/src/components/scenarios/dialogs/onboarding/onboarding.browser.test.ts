import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import Onboarding from './onboarding.vue'

import { useProviderConfigStore } from '../../../../stores/providers/config'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('onboarding provider configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists OpenCode Go credentials before it loads models', async () => {
    // ROOT CAUSE:
    //
    // The onboarding flow wrote credentials to the computed `configs` snapshot.
    // A first-time OpenCode Go selection had no persisted provider entry, so
    // the model loader could not read its API key and returned no models.
    //
    // The onboarding owner now writes through the provider config store before
    // it asks the provider runtime store to load models.
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Model airi-credential-check-model-does-not-exist was not found.' },
    }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const pinia = createPinia()
    const screen = render(Onboarding, {
      global: {
        directives: { motion: {} },
        plugins: [pinia, PiniaColada, createTestI18n()],
      },
    })

    await screen.getByText('Setup with your provider').click()
    await screen.getByText('OpenCode Go').click()
    await screen.getByText('Next').click()
    await screen.getByLabelText('API Key').fill('opencode-test-key')
    await screen.getByText(/Allow airi to send/).click()
    await screen.getByText('Next').click()

    const providerConfigStore = useProviderConfigStore(pinia)
    expect(providerConfigStore.providers['opencode-go']).toMatchObject({
      id: 'opencode-go',
      definitionId: 'opencode-go',
      config: { apiKey: 'opencode-test-key' },
      status: 'configured',
    })
    expect(providerConfigStore.listedProviders['opencode-go']).toBeDefined()
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://opencode.ai/zen/go/v1/chat/completions'),
      expect.objectContaining({ body: expect.stringContaining('airi-credential-check-model-does-not-exist') }),
    )
    await expect.element(screen.getByText('Kimi K3')).toBeInTheDocument()
  })
})
