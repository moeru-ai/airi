import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CometApiSpeechPage from './comet-api-speech.vue'
import OpenAICompatibleSpeechPage from './openai-compatible-audio-speech.vue'

import 'virtual:uno.css'

const providerId = 'openai-compatible-audio-speech'
const syncedContexts: Array<{
  app?: App
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode, mount: true): {
  pinia: ReturnType<typeof createPinia>
  providerConfigStore: ReturnType<typeof useProviderConfigStore>
  providerStore: ReturnType<typeof useProviderStore>
  runtime: SyncedPiniaRuntime
}
function createSyncedContext(namespace: string, leadership: LeadershipMode, mount?: false): {
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}
function createSyncedContext(namespace: string, leadership: LeadershipMode, mount = false) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)

  if (!mount) {
    syncedContexts.push({ pinia, runtime })
    return { pinia, runtime }
  }

  let providerConfigStore: ReturnType<typeof useProviderConfigStore> | undefined
  let providerStore: ReturnType<typeof useProviderStore> | undefined
  const app = createApp({
    setup() {
      providerConfigStore = useProviderConfigStore()
      providerStore = useProviderStore()
      useSpeechStore()
      return () => null
    },
  })
  app
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
    .use(pinia)
    .use(PiniaColada)
    .mount(document.createElement('div'))
  if (!providerConfigStore || !providerStore)
    throw new Error('Provider stores did not initialize')

  syncedContexts.push({ app, pinia, runtime })
  return { pinia, providerConfigStore, providerStore, runtime }
}

describe('speech provider configuration persistence', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    // The form must accept credentials before a TTS server is reachable.
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      throw new TypeError('TTS server unavailable')
    }))
  })

  async function renderPage(component = OpenAICompatibleSpeechPage) {
    await page.viewport(1100, 1100)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    return await render(component, {
      global: {
        plugins: [pinia, PiniaColada, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
        directives: { motion: {} },
      },
    })
  }

  afterEach(() => {
    const disposedPinia = new Set<ReturnType<typeof createPinia>>()
    for (const context of syncedContexts.splice(0)) {
      context.app?.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
      disposedPinia.add(context.pinia)
    }
    if (!disposedPinia.has(pinia))
      disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // ROOT CAUSE:
  //
  // The immediate model watcher creates an entry in the computed configs map.
  // initializeProvider sees that entry and skips creation of the persisted provider.
  // Input changes then mutate a plain object, so the playground keeps its cached
  // missing-key state and localStorage stays empty. These tests fail if the page
  // and initialization flow stop writing through the provider store.
  // https://github.com/moeru-ai/airi/issues/2449
  it('enables Test Voice after the user enters an API key (Issue #2449)', async () => {
    const screen = await renderPage()

    const testVoice = screen.getByRole('button', { name: 'Test Voice', exact: true })
    await expect.element(testVoice).toBeDisabled()
    await page.getByPlaceholder('sk-...').fill('issue-2449-test-key')
    await expect.element(testVoice, { timeout: 1500 }).toBeEnabled()
    await expect.element(screen.getByText('Please enter an API key to test the voice.')).not.toBeInTheDocument()
    expect(useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('persists a key entered on a fresh settings page (Issue #2449)', async () => {
    await renderPage()
    await page.getByPlaceholder('sk-...').fill('issue-2449-test-key')

    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)[providerId]?.config?.apiKey
    }, { timeout: 2000 }).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449#issuecomment-5586964144
  it('accepts the reported workaround with a persisted provider (Issue #2449)', async () => {
    localStorage.setItem('settings/providers/configured', JSON.stringify({
      [providerId]: {
        id: providerId,
        definitionId: providerId,
        config: { apiKey: 'issue-2449-test-key', baseUrl: 'http://127.0.0.1:8080/v1/', model: 'qwen', voice: 'assistant' },
        status: 'unconfigured',
        configuredBy: 'user',
      },
    }))
    const screen = await renderPage()
    await expect.element(screen.getByRole('button', { name: 'Test Voice', exact: true })).toBeEnabled()
    expect(useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('issue-2449-test-key')
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('enables Comet API Test Voice after the user enters an API key (Issue #2449)', async () => {
    const screen = await renderPage(CometApiSpeechPage)

    const testVoice = screen.getByRole('button', { name: 'Test Voice', exact: true })
    await expect.element(testVoice).toBeDisabled()
    await page.getByPlaceholder('API Key').fill('issue-2449-comet-key')
    await expect.element(testVoice, { timeout: 1500 }).toBeEnabled()
  })

  // https://github.com/moeru-ai/airi/issues/2449
  it('persists a Comet API key entered on a fresh settings page (Issue #2449)', async () => {
    await renderPage(CometApiSpeechPage)
    await page.getByPlaceholder('API Key').fill('issue-2449-comet-key')

    await expect.poll(() => {
      const stored = localStorage.getItem('settings/providers/configured')
      if (!stored)
        return undefined
      return JSON.parse(stored)['comet-api-speech']?.config?.apiKey
    }, { timeout: 2000 }).toBe('issue-2449-comet-key')
  })

  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4008085209
  // ROOT CAUSE:
  //
  // Plain Pinia tests ran the synchronized action in one renderer. They did not
  // exercise the follower RPC, the leader merge, or snapshot reconciliation.
  it('synchronizes repeated follower edits without proposing replicated state', async () => {
    const namespace = `speech-provider-settings:${crypto.randomUUID()}`
    const leader = createSyncedContext(namespace, 'leader-only', true)
    await expect.poll(() => leader.runtime.isLeader()).toBe(true)

    const follower = createSyncedContext(namespace, 'follower-only')
    await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
    pinia = follower.pinia

    await leader.providerStore.initializeProvider(providerId)
    await leader.providerConfigStore.patchProviderConfig(providerId, { apiKey: 'leader-key' })
    await renderPage()
    const apiKeyInput = page.getByPlaceholder('sk-...')
    await expect.element(apiKeyInput).toHaveValue('leader-key')

    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
    await leader.providerConfigStore.patchProviderConfig(providerId, { apiKey: 'remote-key' })
    await expect.element(apiKeyInput).toHaveValue('remote-key')
    expect(traffic).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'onCall',
      rest: expect.arrayContaining(['replaceState']),
    }))

    await apiKeyInput.fill('follower-key-one')
    await apiKeyInput.fill('follower-key-two')
    await expect.poll(() => leader.providerConfigStore.getProviderConfig(providerId)?.apiKey, { timeout: 2500 }).toBe('follower-key-two')
    await expect.poll(() => useProviderConfigStore(pinia).getProviderConfig(providerId)?.apiKey).toBe('follower-key-two')
  })
})
