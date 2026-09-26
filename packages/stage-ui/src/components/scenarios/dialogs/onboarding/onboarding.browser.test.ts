import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import OnboardingDialog from './onboarding.vue'
import StepProviderConfiguration from './step-provider-configuration.vue'

import { useAuthStore } from '../../../../stores/auth'
import { useProviderConfigStore } from '../../../../stores/providers/config'
import { useProviderStore } from '../../../../stores/providers/provider'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const syncedContexts: Array<{
  app: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  let providerStore: ReturnType<typeof useProviderStore> | undefined
  let providerConfigStore: ReturnType<typeof useProviderConfigStore> | undefined
  const app = createApp({
    setup() {
      providerStore = useProviderStore()
      providerConfigStore = useProviderConfigStore()
      return () => null
    },
  })
  app
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .mount(document.createElement('div'))
  if (!providerStore || !providerConfigStore)
    throw new Error('Provider stores did not initialize')

  syncedContexts.push({ app, pinia, runtime })
  return { pinia, providerConfigStore, providerStore, runtime }
}

function createTestI18n() {
  return createI18n({ legacy: false, locale: 'en', messages: { en } })
}

beforeEach(() => {
  localStorage.clear()
  // The validators, model listing, and the ping check all run against the
  // configured gateway. One stub answers every OpenAI-compatible endpoint.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/chat/completions')) {
      return Response.json({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 0,
        model: 'grok-4.6',
        choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    }
    return Response.json({ object: 'list', data: [{ id: 'grok-4.6' }, { id: 'grok-4.5' }] })
  }))
})

afterEach(() => {
  for (const context of syncedContexts.splice(0)) {
    context.app.unmount()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  localStorage.clear()
})

it('publishes the onboarding login click on the leader', async () => {
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  const namespace = `onboarding-login:${crypto.randomUUID()}`
  const leader = createSyncedContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const follower = createSyncedContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  const screen = await render(OnboardingDialog, {
    global: { plugins: [follower.pinia, PiniaColada, createTestI18n()] },
  })

  await screen.getByRole('button', { name: 'Sign in' }).click()

  await expect.poll(() => useAuthStore(leader.pinia).needsLogin).toBe(true)
  await expect.poll(() => useAuthStore(follower.pinia).needsLogin).toBe(true)
})

// ROOT CAUSE:
//
// saveProviderConfiguration wrote credentials through the `configs` computed
// projection, so the save never reached the owning synchronized state and was
// discarded on recompute — fetchModelsForProvider then returned an empty
// catalog ("no models available") despite validation succeeding.
//
// The desktop onboarding window is a sync follower; this test drives the real
// dialog there and asserts the save reaches the leader and localStorage.
it('persists configured credentials through the leader and loads the model list', async () => {
  const namespace = `onboarding-dialog:${crypto.randomUUID()}`
  const leader = createSyncedContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)

  const follower = createSyncedContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)

  const screen = await render(OnboardingDialog, {
    global: { plugins: [follower.pinia, PiniaColada, createTestI18n()] },
  })

  await screen.getByRole('button', { name: 'Setup with your provider' }).click()

  // The provider card is a label with a visually hidden radio input; click the
  // card title text instead of the input, which decorative elements overlap.
  const providerCard = screen.getByText('OpenAI Compatible').first()
  await expect.element(providerCard).toBeInTheDocument()
  await providerCard.click()
  await screen.getByRole('button', { name: 'Next' }).click()

  // The API key field is a password input whose placeholder is 'API Key' for
  // openai-compatible; the base URL field keeps the schema default placeholder.
  const apiKeyInput = page.getByPlaceholder('API Key')
  await expect.element(apiKeyInput).toBeInTheDocument()
  await apiKeyInput.fill('sk-test-onboarding')
  await screen.getByRole('button', { name: 'Next' }).click()

  const providerId = 'openai-compatible'
  const expectedConfig = { apiKey: 'sk-test-onboarding', baseUrl: 'https://api.openai.com/v1' }

  // The leader owns persistence and must hold the saved credentials.
  //
  // Config and status arrive on two separate leader-routed round-trips: `setProviderStatus` is
  // dispatched later, by the validation chain in stores/providers/provider.ts. Polling one and
  // reading the other synchronously raced, landing on the initial 'unconfigured' under load.
  await expect.poll(() => ({
    config: leader.providerConfigStore.getProviderConfig(providerId),
    status: leader.providerConfigStore.providers[providerId]?.status,
    added: leader.providerConfigStore.addedProviders[providerId],
  })).toMatchObject({
    config: expectedConfig,
    status: 'configured',
    added: true,
  })

  await expect.poll(() => JSON.parse(localStorage.getItem('settings/providers/configured') ?? '{}')).toMatchObject({
    [providerId]: { config: expectedConfig },
  })

  // The model list loads through the leader and becomes visible in the
  // follower's replicated runtime state and in the step UI.
  await expect.poll(
    () => follower.providerStore.getModelsForProvider(providerId).map(model => model.id),
    { timeout: 10_000 },
  ).toContain('grok-4.6')
  await expect.element(screen.getByText('grok-4.6')).toBeInTheDocument()
})

// ROOT CAUSE:
//
// The configuration step kept its form in component-local refs and reset them
// in initializeForm() on every mount. Each step change remounts the step, so
// going back from model selection wiped the typed API key and restored the
// default base URL.
it('rehydrates the configuration form from the saved provider configuration', async () => {
  const context = createSyncedContext(`onboarding-step:${crypto.randomUUID()}`, 'leader-only')
  await context.providerConfigStore.ensureProvider('openai-compatible', 'openai-compatible', {})
  await context.providerConfigStore.patchProviderConfig('openai-compatible', {
    apiKey: 'sk-saved-key',
    baseUrl: 'https://saved.example.com/v1',
  })

  await vi.waitFor(() => {
    expect(context.providerStore.allChatProvidersMetadata.some(provider => provider.id === 'openai-compatible')).toBe(true)
  })
  const metadata = context.providerStore.allChatProvidersMetadata.find(provider => provider.id === 'openai-compatible')
  if (!metadata)
    throw new Error('openai-compatible metadata did not initialize')

  await render(StepProviderConfiguration, {
    props: {
      selectedProviderId: 'openai-compatible',
      selectedProvider: metadata,
      onNext: () => {},
      onPrevious: () => {},
    },
    global: { plugins: [context.pinia, PiniaColada, createTestI18n()] },
  })

  await expect.element(page.getByPlaceholder('API Key')).toHaveValue('sk-saved-key')
  await expect.element(page.getByPlaceholder('https://api.openai.com/v1')).toHaveValue('https://saved.example.com/v1')
})
