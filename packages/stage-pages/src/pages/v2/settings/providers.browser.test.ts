import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProvidersCatalogPage from './providers.vue'

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
    vi.unstubAllEnvs()
    disposePinia(pinia)
    localStorage.clear()
  })

  it('hides persisted cloud ASR entries in Steam while retaining local ASR', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const config = useProviderConfigStore(pinia)
    await config.ensureProvider('legacy-cloud', 'official-provider-transcription', {})
    await config.markProviderAdded('legacy-cloud')
    await config.ensureProvider('saved-openai', 'openai', {})
    await config.markProviderAdded('saved-openai')
    await config.ensureProvider('saved-streaming', 'official-provider-speech-streaming', {})
    await config.markProviderAdded('saved-streaming')
    await config.ensureProvider('sherpaw-transcription', 'sherpaw-transcription', {})
    await config.markProviderAdded('sherpaw-transcription')
    const screen = await renderCatalog()
    await expect.element(screen.getByText('Sherpaw', { exact: true })).toBeVisible()
    expect((await screen.getByText('Official Transcription Provider', { exact: true }).all())).toHaveLength(0)
    expect((await screen.getByText('OpenAI', { exact: true }).all())).toHaveLength(0)
    expect(document.body.textContent).not.toContain('Official Streaming Speech Provider')
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
})
