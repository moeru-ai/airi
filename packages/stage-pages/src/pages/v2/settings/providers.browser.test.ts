import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProvidersPage from './providers.vue'
import ProviderEditPage from './providers/edit/[providerId]/index.vue'

import 'virtual:uno.css'

const providers = {
  'provider-production': {
    id: 'provider-production',
    definitionId: 'openai-compatible',
    displayName: 'Production OpenAI',
    config: { baseUrl: 'https://production.example.com/v1' },
    status: 'configured',
    configuredBy: 'user',
  },
  'provider-staging': {
    id: 'provider-staging',
    definitionId: 'openai-compatible',
    displayName: 'Staging OpenAI',
    config: { baseUrl: 'https://staging.example.com/v1' },
    status: 'configured',
    configuredBy: 'user',
  },
} as const

const remoteSnapshot = Object.values(providers).map(provider => ({
  id: provider.id,
  definitionId: provider.definitionId,
  config: provider.config,
  status: provider.status,
  configuredBy: provider.configuredBy,
  validated: true,
  validationBypassed: false,
}))

describe('v2 Provider display names', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('settings/providers/configured', JSON.stringify(providers))
    localStorage.setItem('settings/providers/added', JSON.stringify({
      [providers['provider-production'].id]: true,
      [providers['provider-staging'].id]: true,
    }))
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v1/providers/provider-production') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          ...providers['provider-production'],
          displayName: 'Production Gateway',
          validated: true,
          validationBypassed: false,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.endsWith('/api/v1/providers')) {
        return new Response(JSON.stringify(remoteSnapshot), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    pinia = createPinia()
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('keeps two named Provider instances visible after a remote snapshot omits display names', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const screen = await render(ProvidersPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: {
          'auto-animate': {},
          'motion': {},
        },
      },
    })

    await expect.element(screen.getByText('Production OpenAI', { exact: true })).toBeInTheDocument()
    await expect.element(screen.getByText('Staging OpenAI', { exact: true })).toBeInTheDocument()

    const store = useProviderConfigStore(pinia)
    await store.fetchProviders()

    expect(store.getProvider(providers['provider-production'].id)?.displayName).toBe('Production OpenAI')
    expect(store.getProvider(providers['provider-staging'].id)?.displayName).toBe('Staging OpenAI')
  })

  it('saves a custom display name from the Provider edit screen', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/v2/settings/providers/edit/:providerId', component: ProviderEditPage }],
    })
    await router.push(`/v2/settings/providers/edit/${providers['provider-production'].id}`)

    const screen = await render(ProviderEditPage, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: {
          'auto-animate': {},
          'motion': {},
        },
      },
    })

    const displayNameInput = screen.getByRole('textbox').first()
    await expect.element(displayNameInput).toBeInTheDocument()
    await displayNameInput.fill('Production Gateway')

    await expect.poll(() => useProviderConfigStore(pinia).getProvider(providers['provider-production'].id)?.displayName).toBe('Production Gateway')
    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)[providers['provider-production'].id]?.displayName
    }).toBe('Production Gateway')
    await expect.element(screen.getByText('Production Gateway', { exact: true })).toBeInTheDocument()
  })
})
