import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useHearingSpeechInputPipeline, useHearingStore } from './hearing'

const webSpeechMocks = vi.hoisted(() => ({
  stream: vi.fn(() => ({
    fullStream: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    text: Promise.resolve(''),
    textStream: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
    recognition: { stop: vi.fn() },
  })),
}))

vi.mock('../../libs/providers/providers/browser-web-speech-api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../libs/providers/providers/browser-web-speech-api')>()
  return {
    ...original,
    streamWebSpeechAPITranscription: webSpeechMocks.stream,
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (key: string) => key,
  }),
}))

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => new Proxy({}, { get: () => () => {} }),
}))

const syncedContexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
}> = []

function createSyncedContext(namespace: string, leadership: LeadershipMode) {
  const app = createApp({})
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({
    callTimeout: 1000,
    leadership,
    namespace,
  })
  pinia.use(runtime.plugin)
  app.use(pinia)
  app.use(PiniaColada)
  syncedContexts.push({ pinia, runtime })
  return { pinia, runtime }
}

describe('web speech model ownership', () => {
  beforeEach(() => {
    localStorage.clear()
    Reflect.set(window, 'SpeechRecognition', vi.fn())
  })

  afterEach(() => {
    for (const context of syncedContexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    localStorage.clear()
    Reflect.deleteProperty(window, 'SpeechRecognition')
    webSpeechMocks.stream.mockClear()
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3887591819
  it('keeps the default model with the provider that started the stream (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const namespace = `hearing-web-speech:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))

    setActivePinia(leaderContext.pinia)
    const leaderProvidersStore = useProviderStore()
    const leaderProviderConfigStore = useProviderConfigStore()
    const leaderHearingStore = useHearingStore()
    await leaderProvidersStore.initializeProvider(providerId)
    await leaderProvidersStore.initializeProvider('openai-audio-transcription')
    await leaderHearingStore.setActiveTranscriptionProvider(providerId, '')

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerHearingStore = useHearingStore()
    const followerPipeline = useHearingSpeechInputPipeline()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => expect(followerHearingStore.activeTranscriptionProvider).toBe(providerId))

    const streaming = followerPipeline.transcribeForMediaStream({} as MediaStream, {
      consumerId: 'web-speech-model-ownership',
    })
    await followerHearingStore.setActiveTranscriptionProvider('openai-audio-transcription', 'whisper-1')
    await streaming
    await vi.waitFor(() => expect(leaderHearingStore.activeTranscriptionProvider).toBe('openai-audio-transcription'))

    // ROOT CAUSE:
    //
    // The synchronized default-model action read the active provider in the leader.
    // A newer provider action could reach the leader before that model action.
    expect(leaderProviderConfigStore.getProviderConfig(providerId)?.model).toBe('web-speech-api')
    expect(leaderHearingStore.activeTranscriptionProvider).toBe('openai-audio-transcription')
    expect(leaderHearingStore.activeTranscriptionModel).toBe('whisper-1')
    expect(leaderProviderConfigStore.getProviderConfig('openai-audio-transcription')?.model).toBe('whisper-1')

    await followerPipeline.stopStreamingTranscription(false, providerId)
  })
})
