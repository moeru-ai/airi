import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import type { OnboardingStepLaterHandler, OnboardingStepNextHandler } from './types'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import OnboardingDialog from './onboarding.vue'
import StepProviderConfiguration from './step-provider-configuration.vue'

import { useAuthStore } from '../../../../stores/auth'
import { sharedOnboardingSteps, useOnboardingStore } from '../../../../stores/onboarding'
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
  await expect.poll(() => leader.providerConfigStore.getProviderConfig(providerId)).toMatchObject(expectedConfig)
  // The dialog saves the config and then the status, each through its own
  // leader call, so the status can reach the leader after the config.
  await expect.poll(() => leader.providerConfigStore.providers[providerId]?.status).toBe('configured')
  await expect.poll(() => leader.providerConfigStore.addedProviders[providerId]).toBe(true)

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

/** A host step with one button for each handler that the flow gives it. */
const HostStep = defineComponent(
  (props: { onNext: OnboardingStepNextHandler, onLater?: OnboardingStepLaterHandler }) => () => h('div', [
    h('button', { onClick: () => props.onNext() }, 'Continue'),
    props.onLater ? h('button', { onClick: () => props.onLater?.() }, 'Later') : null,
  ]),
  { props: ['onNext', 'onLater'] },
)

/** Records every shared step as done, as a device that finished the first onboarding. */
function seedFinishedSharedSteps() {
  localStorage.setItem('onboarding/steps', JSON.stringify(Object.fromEntries(
    sharedOnboardingSteps.map(step => [step.id, { version: step.version, outcome: 'done', at: 0 }]),
  )))
}

function readStepRecords() {
  return JSON.parse(localStorage.getItem('onboarding/steps') ?? '{}')
}

it('shows only the host step whose version increased, and resolves the request of the main window', async () => {
  seedFinishedSharedSteps()
  localStorage.setItem('onboarding/steps', JSON.stringify({ ...readStepRecords(), 'host-notice': { version: 1, outcome: 'done', at: 0 } }))
  // On desktop, the main window is the leader and requests the flow. The onboarding window is a follower and renders it.
  const hostSteps = [{ id: 'host-notice', version: 2, component: HostStep }]
  const namespace = `onboarding-versions:${crypto.randomUUID()}`
  const leader = createSyncedContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const mainWindow = useOnboardingStore(leader.pinia)
  mainWindow.registerHostSteps(hostSteps)
  const follower = createSyncedContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  const onboardingWindow = useOnboardingStore(follower.pinia)
  onboardingWindow.registerHostSteps(hostSteps)

  expect(mainWindow.needsOnboarding).toBe(true)
  const result = mainWindow.request({ source: 'startup' })
  await expect.poll(() => onboardingWindow.activeRequest?.stepIds).toEqual(['host-notice'])
  const configured = vi.fn()

  const screen = await render(OnboardingDialog, {
    props: { extraSteps: hostSteps, onConfigured: configured },
    global: { plugins: [follower.pinia, PiniaColada, createTestI18n()] },
  })

  await expect.element(screen.getByRole('button', { name: 'Sign in' })).not.toBeInTheDocument()
  await expect.element(screen.getByRole('button', { name: 'Later' })).not.toBeInTheDocument()
  await screen.getByRole('button', { name: 'Continue' }).click()

  expect(await result).toEqual({ 'host-notice': 'done' })
  // The leader ends the request before the settle call returns to the onboarding window.
  await vi.waitFor(() => expect(configured).toHaveBeenCalled())
  expect(readStepRecords()['host-notice']).toMatchObject({ version: 2, outcome: 'done' })
})

it('keeps the later record of an optional step that the user postponed', async () => {
  seedFinishedSharedSteps()
  const hostSteps = [{ id: 'host-permissions', version: 2, optional: true, scope: 'device' as const, component: HostStep }]
  const context = createSyncedContext(`onboarding-later:${crypto.randomUUID()}`, 'leader-only')
  await expect.poll(() => context.runtime.isLeader()).toBe(true)
  const store = useOnboardingStore(context.pinia)
  store.registerHostSteps(hostSteps)
  const result = store.request({ steps: ['host-permissions'], source: 'settings' })
  await expect.poll(() => store.activeRequest).not.toBeNull()

  const configured = vi.fn()

  const screen = await render(OnboardingDialog, {
    props: { extraSteps: hostSteps, onConfigured: configured },
    global: { plugins: [context.pinia, PiniaColada, createTestI18n()] },
  })

  await screen.getByRole('button', { name: 'Later' }).click()

  expect(await result).toEqual({ 'host-permissions': 'later' })
  // The request ends inside the settle call. Wait for the flow to finish before teardown.
  await vi.waitFor(() => expect(configured).toHaveBeenCalled())
  expect(readStepRecords()['host-permissions']).toMatchObject({ version: 2, outcome: 'later' })
})

// Found in the review of https://github.com/moeru-ai/airi/pull/3296
// ROOT CAUSE:
//
// The flow read the open request once at mount. The desktop onboarding window can mount before the
// request reaches it, so a request for one step showed an empty flow that could not finish.
//
// We fixed this by following the open request.
it('shows the requested step when the request reaches the window after the flow mounts', async () => {
  seedFinishedSharedSteps()
  // Its record is current, so no step is pending when the flow mounts.
  localStorage.setItem('onboarding/steps', JSON.stringify({ ...readStepRecords(), 'host-permissions': { version: 1, outcome: 'done', at: 0 } }))
  const hostSteps = [{ id: 'host-permissions', scope: 'device' as const, component: HostStep }]
  const namespace = `onboarding-late-request:${crypto.randomUUID()}`
  const leader = createSyncedContext(namespace, 'leader-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  const mainWindow = useOnboardingStore(leader.pinia)
  mainWindow.registerHostSteps(hostSteps)
  const follower = createSyncedContext(namespace, 'follower-only')
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  useOnboardingStore(follower.pinia).registerHostSteps(hostSteps)
  const configured = vi.fn()

  const screen = await render(OnboardingDialog, {
    props: { extraSteps: hostSteps, onConfigured: configured },
    global: { plugins: [follower.pinia, PiniaColada, createTestI18n()] },
  })
  await expect.element(screen.getByRole('button', { name: 'Continue' })).not.toBeInTheDocument()

  const result = mainWindow.request({ steps: ['host-permissions'], source: 'settings', force: true })
  await screen.getByRole('button', { name: 'Continue' }).click()

  expect(await result).toEqual({ 'host-permissions': 'done' })
  await vi.waitFor(() => expect(configured).toHaveBeenCalled())
})
