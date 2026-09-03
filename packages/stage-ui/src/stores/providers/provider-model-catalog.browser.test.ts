import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from './config'
import { useProviderStore } from './provider'

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

describe('provider model catalog synchronization', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.app.unmount()
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/pull/2440#discussion_r3912226716
  // ROOT CAUSE:
  //
  // The streaming provider stored server availability and its default model
  // in module-local variables. A follower-only settings window routed model
  // discovery to the leader, then read its own unchanged local variables.
  //
  // Before: the leader returned only the models and kept the other catalog
  // fields in its renderer.
  //
  // We fixed this by returning one serializable model catalog from the action.
  // The follower receives the models, availability, and default model together.
  it('returns streaming catalog metadata to a follower-only renderer', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      available: true,
      default: 'volcengine/seed-tts-2.0',
      models: [
        { id: 'volcengine/seed-tts-2.0', name: 'Seed TTS 2.0' },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const namespace = `provider-model-catalog:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    await followerContext.providerStore.initializeProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    const catalog = await followerContext.providerStore.fetchModelsForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)

    expect(catalog).toEqual({
      available: true,
      defaultModel: 'volcengine/seed-tts-2.0',
      models: [
        expect.objectContaining({
          id: 'volcengine/seed-tts-2.0',
          name: 'Seed TTS 2.0',
          provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
        }),
      ],
    })
    await vi.waitFor(() => expect(followerContext.providerStore.getDefaultModelForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)).toBe('volcengine/seed-tts-2.0'))

    // https://github.com/moeru-ai/airi/pull/2445#discussion_r3913843853
    // ROOT CAUSE:
    //
    // A function returned from a Pinia setup store becomes an action. The
    // default-model lookup was a pure read, but it still ran action hooks.
    //
    // Before: getDefaultModelForProvider was a returned store function.
    //
    // We fixed this by exposing the parameterized lookup as a computed getter.
    const actionNames: string[] = []
    followerContext.providerStore.$onAction(({ name }) => actionNames.push(name))

    expect(followerContext.providerStore.getDefaultModelForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)).toBe('volcengine/seed-tts-2.0')
    expect(actionNames).not.toContain('getDefaultModelForProvider')
  })

  // https://github.com/moeru-ai/airi/pull/2440#discussion_r3912911639
  // ROOT CAUSE:
  //
  // The settings renderer wrote the discovered default into its follower
  // snapshot. The resulting full-state proposal could overwrite newer leader
  // state, and the write was skipped when that snapshot arrived late.
  //
  // Before: mutate providerConfig.model in the follower page.
  //
  // We fixed this by routing model updates to awaited leader-owned actions.
  it('applies defaults through the leader without replacing a user selection', async () => {
    const namespace = `provider-model-default:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    const followerContext = createSyncedContext(namespace, 'follower-only')
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    await followerContext.providerStore.initializeProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    await followerContext.providerConfigStore.setProviderModelIfUnset(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-2.0',
    )
    await vi.waitFor(() => expect(followerContext.providerConfigStore.getProviderConfig(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)?.model).toBe('volcengine/seed-tts-2.0'))

    await leaderContext.providerConfigStore.setProviderModel(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-1.0',
    )
    await followerContext.providerConfigStore.setProviderModelIfUnset(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-2.0',
    )

    expect(leaderContext.providerConfigStore.getProviderConfig(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)?.model).toBe('volcengine/seed-tts-1.0')
    await vi.waitFor(() => expect(followerContext.providerConfigStore.getProviderConfig(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)?.model).toBe('volcengine/seed-tts-1.0'))
  })
})
