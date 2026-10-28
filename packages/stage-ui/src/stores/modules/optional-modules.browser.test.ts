import type { PcmBlock } from '@proj-airi/pipelines-audio'
import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { generateTranscription } from '@xsai/generate-transcription'
import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision/store'

vi.mock('@xsai/generate-transcription', () => ({ generateTranscription: vi.fn() }))

const contexts: { pinia: ReturnType<typeof createPinia>, runtime?: SyncedPiniaRuntime, unmount: () => void }[] = []

function createContext(namespace?: string, leadership?: LeadershipMode) {
  const pinia = createPinia()
  const runtime = namespace ? createSyncedPiniaPlugin({ namespace, leadership, callTimeout: 1000 }) : undefined
  if (runtime)
    pinia.use(runtime.plugin)
  let hearing!: ReturnType<typeof useHearingStore>
  let vision!: ReturnType<typeof useVisionStore>
  let speech!: ReturnType<typeof useSpeechStore>
  const app = createApp({
    setup() {
      hearing = useHearingStore(pinia)
      vision = useVisionStore(pinia)
      speech = useSpeechStore(pinia)
      return () => null
    },
  }).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })).use(pinia)
  app.mount(document.createElement('div'))
  contexts.push({ pinia, runtime, unmount: () => app.unmount() })
  return { pinia, runtime, hearing, vision, speech }
}

afterEach(() => {
  for (const { pinia, runtime, unmount } of contexts.splice(0)) {
    unmount()
    runtime?.dispose()
    disposePinia(pinia)
  }
  localStorage.clear()
  vi.mocked(generateTranscription).mockReset()
})

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// Provider selection also implied activation. Persisted enable states now retain selections while disabling the modules.
it('issue #3153: retains disabled modules and their settings after reopening', async () => {
  const first = createContext()
  first.hearing.activeTranscriptionProvider = 'browser-web-speech-api'
  first.hearing.activeTranscriptionModel = 'web-speech-api'
  first.vision.activeProvider = 'vision-ollama'
  first.vision.activeModel = 'saved-vision-model'
  first.hearing.enabled = false
  first.vision.enabled = false
  first.speech.enabled = false
  await nextTick()

  const reopened = createContext()
  expect(reopened.hearing.enabled).toBe(false)
  expect(reopened.hearing.configured).toBe(false)
  expect(reopened.hearing.activeTranscriptionProvider).toBe('browser-web-speech-api')
  expect(reopened.hearing.activeTranscriptionModel).toBe('web-speech-api')
  expect(reopened.vision.enabled).toBe(false)
  expect(reopened.vision.configured).toBe(false)
  expect(reopened.vision.activeModel).toBe('saved-vision-model')
  expect(reopened.speech.enabled).toBe(false)
  expect(reopened.speech.configured).toBe(false)
  reopened.hearing.enabled = true
  reopened.vision.enabled = true
  expect(reopened.hearing.configured).toBe(true)
  expect(reopened.vision.configured).toBe(true)
})

it('replicates disabled states without a follower proposal', async () => {
  const namespace = `optional-modules:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  const follower = createContext(namespace, 'follower-only')
  await vi.waitFor(() => expect(follower.runtime?.getLeaderId()).toBe(leader.runtime?.participantId))
  let leaderMutations = 0
  let followerMutations = 0
  for (const store of [leader.hearing, leader.vision, leader.speech])
    store.$subscribe(() => leaderMutations++, { flush: 'sync' })
  for (const store of [follower.hearing, follower.vision, follower.speech])
    store.$subscribe(() => followerMutations++, { flush: 'sync' })

  leader.hearing.enabled = false
  leader.vision.enabled = false
  leader.speech.enabled = false
  await vi.waitFor(() => expect(follower.hearing.enabled).toBe(false))
  await vi.waitFor(() => expect(follower.vision.enabled).toBe(false))
  await vi.waitFor(() => expect(follower.speech.enabled).toBe(false))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(leaderMutations).toBe(3)
  expect(followerMutations).toBe(3)
})

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// The official source card represents two providers. Re-enabling must retain the saved streaming provider and model.
it('issue #3153: restores the streaming selection through the official source card', async () => {
  const { speech } = createContext()
  speech.activeSpeechProvider = OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
  speech.activeSpeechModel = 'saved-streaming-model'
  speech.activeSpeechVoiceId = 'saved-voice'
  await speech.selectSource('speech-noop')
  expect(speech.enabled).toBe(false)
  const selection = await speech.selectSource(OFFICIAL_SPEECH_PROVIDER_ID)
  expect(speech.enabled).toBe(true)
  expect(selection).toEqual({ provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, model: 'saved-streaming-model', voice_id: 'saved-voice' })
})

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// Recordings captured a provider without a module lifetime. Disabling now aborts that lifetime and rejects late results.
it('issue #3153: cancels an active transcription and rejects a captured transcriber after re-enabling', async () => {
  const { hearing, pinia } = createContext()
  const provider = 'openai-compatible-audio-transcription'
  await useProviderConfigStore(pinia).ensureProvider(provider, provider, { apiKey: 'saved-key', baseUrl: 'https://asr.invalid/v1/' })
  hearing.activeTranscriptionProvider = provider
  hearing.activeTranscriptionModel = 'whisper-1'
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof generateTranscription>>>()
  vi.mocked(generateTranscription).mockReturnValue(pending.promise)
  const transcriber = hearing.createTranscriber()
  const audio = new ReadableStream<PcmBlock>({
    start(controller) {
      controller.enqueue({ range: { sourceId: 'recording', startFrame: 0, endFrame: 160 }, sampleRate: 16000, channels: [new Float32Array(160)] })
      controller.close()
    },
  })
  const reader = transcriber.transcribe({ audio, signal: new AbortController().signal }).getReader()
  const read = reader.read().catch(error => error)
  await vi.waitFor(() => expect(generateTranscription).toHaveBeenCalledTimes(1))
  const request = vi.mocked(generateTranscription).mock.calls[0][0]
  hearing.enabled = false
  expect(request.abortSignal?.aborted).toBe(true)
  expect(await read).toMatchObject({ name: 'AbortError' })
  expect(() => hearing.createTranscriber()).toThrow()
  pending.resolve({ text: 'late words', duration: 0, language: 'en', segments: [], words: [] })
  await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
  expect(useProviderConfigStore(pinia).getProviderConfig(provider)?.apiKey).toBe('saved-key')

  hearing.enabled = true
  const stale = transcriber.transcribe({ audio: new ReadableStream<PcmBlock>(), signal: new AbortController().signal }).getReader()
  await expect(stale.read()).rejects.toMatchObject({ name: 'AbortError' })
  expect(generateTranscription).toHaveBeenCalledTimes(1)
})
