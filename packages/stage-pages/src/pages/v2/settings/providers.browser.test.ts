import en from '@proj-airi/i18n/locales/en'
import zhHans from '@proj-airi/i18n/locales/zh-Hans'

import { PiniaColada } from '@pinia/colada'
import { registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProvidersCatalogPage from './providers.vue'
import ProviderEditPage from './providers/edit/[providerId]/index.vue'

import 'virtual:uno.css'

describe('v2 providers catalog availability (Issue #2559)', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    // The settings pages can trigger a sign-in request through the auth store.
    // The real app runtime registers this handler; the stub keeps the harness
    // from rejecting an unrelated OIDC flow while the catalog is under test.
    registerAuthorizationHandler(async () => {})
  })

  afterEach(() => {
    disposePinia(pinia)
    localStorage.clear()
  })

  async function renderCatalog() {
    await page.viewport(1280, 900)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    return await render(ProvidersCatalogPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: { autoAnimate: {} },
      },
    })
  }

  // ROOT CAUSE:
  //
  // The v2 add menu mapped raw listProviders() directly, so surface-gated
  // definitions (for example NVIDIA) appeared even though the module pickers
  // hide them again via the availability-filtered provider store.
  //
  // We fixed this by sourcing the menu from availableProvidersMetadata, the
  // same seam the v1 catalog already uses.
  // https://github.com/moeru-ai/airi/issues/2559
  it('hides surface-gated providers from the add menu (Issue #2559)', async () => {
    const screen = await renderCatalog()

    await screen.getByLabelText('Customize options').click()
    const menu = page.getByRole('menu')
    await expect.element(menu).toBeVisible()
    // The availability set resolves asynchronously; OpenAI has no gate, so its
    // appearance proves the menu is populated before asserting the absence.
    await expect.poll(async () => (await menu.getByText('OpenAI', { exact: true }).all()).length, { timeout: 8000 }).toBeGreaterThan(0)
    expect((await menu.getByText('NVIDIA NIM', { exact: true }).all())).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/issues/2559
  it('keeps ungated providers visible in the add menu (Issue #2559)', async () => {
    const screen = await renderCatalog()

    await screen.getByLabelText('Customize options').click()
    const menu = page.getByRole('menu')
    await expect.element(menu).toBeVisible()
    await expect.poll(async () => (await menu.getByText('OpenAI', { exact: true }).all()).length, { timeout: 8000 }).toBeGreaterThan(0)
  })

  it('localizes the default provider name until the user sets a custom name', async () => {
    const provider = {
      id: 'provider-display-name',
      definitionId: 'openai-compatible',
      config: { baseUrl: 'https://example.com/v1' },
      status: 'configured',
      configuredBy: 'user',
    }
    localStorage.setItem('settings/providers/configured', JSON.stringify({ [provider.id]: provider }))
    localStorage.setItem('settings/providers/added', JSON.stringify({ [provider.id]: true }))

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/v2/settings/providers/edit/:providerId', component: ProviderEditPage }],
    })
    await router.push(`/v2/settings/providers/edit/${provider.id}`)

    const screen = await render(ProviderEditPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'zh-Hans', fallbackLocale: 'en', messages: { en, 'zh-Hans': zhHans } })],
        directives: { autoAnimate: {}, motion: {} },
      },
    })
    const providerStore = useProviderConfigStore(pinia)
    const displayNameInput = screen.getByRole('textbox', { name: /display name/i })

    await expect.element(displayNameInput).toHaveValue('OpenAI 兼容 API')
    await expect.element(screen.getByRole('heading', { name: 'OpenAI 兼容 API' })).toBeInTheDocument()
    expect(providerStore.getProvider(provider.id)?.displayName).toBeUndefined()

    await displayNameInput.fill('My OpenAI')

    await expect.poll(() => providerStore.getProvider(provider.id)?.displayName, { timeout: 8000 }).toBe('My OpenAI')
    await expect.element(screen.getByRole('heading', { name: 'My OpenAI' })).toBeInTheDocument()
  })

  // https://github.com/moeru-ai/airi/pull/2590#discussion_r4175042615
  // ROOT CAUSE:
  //
  // The display-name debounce saved the complete edit draft before credential validation finished.
  // This let a name change persist invalid credentials with the previous configured status.
  // We now save the name with the persisted configuration and status.
  it('keeps edited credentials pending when the provider is renamed before validation', async () => {
    const provider = {
      id: 'provider-display-name-validation',
      definitionId: 'openai-compatible',
      displayName: 'OpenAI Compatible',
      config: { apiKey: 'existing-valid-key', baseUrl: 'https://example.com/v1' },
      status: 'configured',
      configuredBy: 'user',
    }
    localStorage.setItem('settings/providers/configured', JSON.stringify({ [provider.id]: provider }))
    localStorage.setItem('settings/providers/added', JSON.stringify({ [provider.id]: true }))

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/v2/settings/providers/edit/:providerId', component: ProviderEditPage }],
    })
    await router.push(`/v2/settings/providers/edit/${provider.id}`)

    const screen = await render(ProviderEditPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: { autoAnimate: {}, motion: {} },
      },
    })
    const apiKeyInput = screen.getByRole('textbox', { name: /API key/i })
    const displayNameInput = screen.getByRole('textbox', { name: /display name/i })

    await apiKeyInput.fill('invalid-edited-key')
    await displayNameInput.fill('Renamed OpenAI')

    const providerStore = useProviderConfigStore(pinia)
    await expect.poll(() => providerStore.getProvider(provider.id)?.displayName, { timeout: 1200 }).toBe('Renamed OpenAI')
    expect(providerStore.getProviderConfig(provider.id)?.apiKey).toBe('existing-valid-key')
    expect(providerStore.getProvider(provider.id)?.status).toBe('configured')
  })
})
