import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { InferenceServiceProvider } from '../../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, watch } from 'vue'

import { inferenceServiceProvidersService } from '../../services/inference-service-providers'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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
    vi.restoreAllMocks()
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888628875
  it('rejects streaming when the selected provider is not configured (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const context = createSyncedContext(`provider-readiness:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const providersStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const hearingStore = useHearingStore()
    await providersStore.initializeProvider(providerId)
    await hearingStore.setActiveTranscriptionProvider(providerId, 'web-speech-api')
    await providerConfigStore.setProviderStatus(providerId, 'invalid')
    await vi.waitFor(() => expect(providerConfigStore.getProvider(providerId)?.status).toBe('invalid'))

    const pipeline = useHearingSpeechInputPipeline()
    await pipeline.transcribeForMediaStream({} as MediaStream, {
      consumerId: 'invalid-provider',
    })

    expect(webSpeechMocks.stream).not.toHaveBeenCalled()
    expect(pipeline.error).toBe('Transcription provider is not configured. Check its settings before starting speech recognition.')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888326499
  // ROOT CAUSE:
  //
  // A follower started provider creation before its leader-routed ensure action
  // replicated configuration locally. The factory then recursed on a false
  // credential mismatch. Awaiting the action establishes the snapshot boundary.
  it('awaits follower provider configuration before creating a local instance (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const namespace = `provider-first-use:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    useProviderStore()
    const leaderConfigStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerProviderStore = useProviderStore()
    const followerConfigStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const definition = followerProviderStore.getProviderDefinition(providerId)
    const createProviderImplementation = definition.createProvider.bind(definition)
    const createProvider = vi.spyOn(definition, 'createProvider').mockImplementation(async (config) => {
      if (createProvider.mock.calls.length > 1)
        throw new Error('provider creation repeated before configuration replication')
      return createProviderImplementation(config)
    })

    await expect(followerProviderStore.getProviderInstance(providerId)).resolves.toBeDefined()

    expect(createProvider).toHaveBeenCalledOnce()
    expect(followerConfigStore.getProvider(providerId)).toBeDefined()
    expect(leaderConfigStore.getProvider(providerId)).toBeDefined()
    const repeatedEnsureResult = await followerConfigStore.ensureProvider(providerId, providerId)
    expect(repeatedEnsureResult).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888326499
  // ROOT CAUSE:
  //
  // The follower captured defaults before awaiting an existing leader config.
  // Rereading after replication makes cache identity and factory input use the
  // authoritative leader-owned configuration.
  it('creates a follower instance with the leader configuration (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const namespace = `provider-existing-config:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    useProviderStore()
    const leaderConfigStore = useProviderConfigStore()

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerProviderStore = useProviderStore()
    const followerConfigStore = useProviderConfigStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))

    const leaderConfig = {
      continuous: false,
      interimResults: false,
      language: 'ja-JP',
      maxAlternatives: 2,
    }
    setActivePinia(leaderContext.pinia)
    leaderConfigStore.ensureProvider(providerId, providerId, leaderConfig)

    setActivePinia(followerContext.pinia)
    const definition = followerProviderStore.getProviderDefinition(providerId)
    const createProviderImplementation = definition.createProvider.bind(definition)
    const createdConfigs: Record<string, unknown>[] = []
    const createProvider = vi.spyOn(definition, 'createProvider').mockImplementation(async (config) => {
      createdConfigs.push({ ...config })
      return createProviderImplementation(config)
    })

    await expect(followerProviderStore.getProviderInstance(providerId)).resolves.toBeDefined()

    expect(createProvider).toHaveBeenCalledOnce()
    expect(createdConfigs).toEqual([leaderConfig])
    expect(followerConfigStore.getProviderConfig(providerId)).toEqual(leaderConfig)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('replicates a provider config and Hearing model without a mismatched frame (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const namespace = `provider-config-model-commit:${crypto.randomUUID()}`
    const leaderContext = createSyncedContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leaderContext.runtime.isLeader()).toBe(true))
    setActivePinia(leaderContext.pinia)
    useProviderStore()
    const leaderConfigStore = useProviderConfigStore()
    const leaderHearingStore = useHearingStore()
    await leaderConfigStore.ensureProvider(providerId, providerId, { language: 'en-US', model: 'old-model' })
    leaderHearingStore.$patch({ activeTranscriptionProvider: providerId, activeTranscriptionModel: 'old-model' })

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerConfigStore = useProviderConfigStore()
    const followerHearingStore = useHearingStore()
    await vi.waitFor(() => expect(followerContext.runtime.getLeaderId()).toBe(leaderContext.runtime.participantId))
    await vi.waitFor(() => {
      expect(followerConfigStore.getProviderConfig(providerId)?.model).toBe('old-model')
      expect(followerHearingStore.activeTranscriptionModel).toBe('old-model')
    })

    const remoteWrite = deferred<InferenceServiceProvider>()
    const patchConfigRemote = vi.spyOn(inferenceServiceProvidersService, 'patchConfigRemote')
      .mockImplementation(async () => remoteWrite.promise)
    const observedPairs: Array<[unknown, string]> = []
    const stop = watch([
      () => followerConfigStore.getProviderConfig(providerId)?.model,
      () => followerHearingStore.activeTranscriptionModel,
    ], ([configModel, hearingModel]) => observedPairs.push([configModel, hearingModel]), { flush: 'post' })

    const config = {
      language: 'ja-JP',
      model: 'new-model',
    }
    const commitId = 'same-frame-save'
    await followerHearingStore.stageTranscriptionProviderConfig(providerId, config, 'configured', commitId)
    const persistence = followerConfigStore.persistProviderConfigIfCurrent(providerId, config, 'configured', commitId)
    await vi.waitFor(() => {
      expect(leaderConfigStore.getProviderConfig(providerId)?.model).toBe('new-model')
      expect(leaderHearingStore.activeTranscriptionModel).toBe('new-model')
    })
    await vi.waitFor(() => {
      expect(followerConfigStore.getProviderConfig(providerId)?.model).toBe('new-model')
      expect(followerHearingStore.activeTranscriptionModel).toBe('new-model')
    })

    // ROOT CAUSE:
    //
    // Two follower RPCs can be processed around a slow remote patch. One leader-owned action
    // stages both stores in the same commit so UI observers never receive a mixed pair.
    expect(observedPairs.filter(([configModel, hearingModel]) => configModel !== hearingModel)).toEqual([])

    remoteWrite.resolve({ ...leaderConfigStore.getProvider(providerId)!, config, status: 'configured' })
    await persistence
    expect(patchConfigRemote).toHaveBeenCalledOnce()
    stop()
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398390
  it('keeps a newer model after leadership changes during persistence (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const namespace = `provider-config-leader-handoff:${crypto.randomUUID()}`
    const firstLeaderContext = createSyncedContext(namespace, 'leader-only')
    setActivePinia(firstLeaderContext.pinia)
    useProviderStore()
    const firstLeaderConfigStore = useProviderConfigStore()
    const firstLeaderHearingStore = useHearingStore()
    await vi.waitFor(() => expect(firstLeaderContext.runtime.isLeader()).toBe(true))
    await firstLeaderConfigStore.ensureProvider(providerId, providerId, { language: 'en-US', model: 'old-model' })
    firstLeaderHearingStore.$patch({ activeTranscriptionProvider: providerId, activeTranscriptionModel: 'old-model' })

    const followerContext = createSyncedContext(namespace, 'follower-only')
    setActivePinia(followerContext.pinia)
    const followerConfigStore = useProviderConfigStore()
    const followerHearingStore = useHearingStore()
    await vi.waitFor(() => expect(followerHearingStore.activeTranscriptionModel).toBe('old-model'))

    const remoteWrite = deferred<InferenceServiceProvider>()
    const patchConfigRemote = vi.spyOn(inferenceServiceProvidersService, 'patchConfigRemote')
      .mockImplementation(async () => remoteWrite.promise)
    const firstConfig = {
      language: 'ja-JP',
      model: 'first-model',
    }
    const firstCommitId = 'before-handoff'
    await followerHearingStore.stageTranscriptionProviderConfig(providerId, firstConfig, 'configured', firstCommitId)
    const firstPersistence = followerConfigStore.persistProviderConfigIfCurrent(
      providerId,
      firstConfig,
      'configured',
      firstCommitId,
    )
    await vi.waitFor(() => expect(patchConfigRemote).toHaveBeenCalledOnce())

    const nextLeaderContext = createSyncedContext(namespace, 'leader-only')
    setActivePinia(nextLeaderContext.pinia)
    useProviderStore()
    const nextLeaderConfigStore = useProviderConfigStore()
    const nextLeaderHearingStore = useHearingStore()
    await vi.waitFor(() => expect(nextLeaderContext.runtime.isLeader()).toBe(true))
    await vi.waitFor(() => {
      expect(nextLeaderHearingStore.activeTranscriptionModel).toBe('first-model')
      expect(nextLeaderConfigStore.providerConfigCommitOwnership[providerId]?.appliedCommits.map(commit => commit.commitId)).toContain(firstCommitId)
    })
    const nextConfig = { language: 'fr-FR', model: 'handoff-model' }
    const nextCommitId = 'after-handoff'
    await nextLeaderHearingStore.stageTranscriptionProviderConfig(providerId, nextConfig, 'configured', nextCommitId)
    await vi.waitFor(() => {
      expect(firstLeaderConfigStore.getProviderConfig(providerId)?.model).toBe('handoff-model')
      expect(firstLeaderHearingStore.activeTranscriptionModel).toBe('handoff-model')
      expect(firstLeaderConfigStore.providerConfigCommitOwnership[providerId]?.currentCommitId).toBe(nextCommitId)
      expect(nextLeaderConfigStore.providerConfigCommitOwnership[providerId]?.currentCommitId).toBe(nextCommitId)
      expect(followerConfigStore.providerConfigCommitOwnership[providerId]?.currentCommitId).toBe(nextCommitId)
    })

    // Simulate at-least-once delivery replaying the completed staging action after the
    // successor has accepted a newer commit. The old commit must not restage or PATCH.
    await expect(nextLeaderHearingStore.stageTranscriptionProviderConfig(
      providerId,
      firstConfig,
      'configured',
      firstCommitId,
    )).resolves.toBe(false)
    const callsBeforeStaleReplay = patchConfigRemote.mock.calls.length
    await nextLeaderConfigStore.persistProviderConfigIfCurrent(providerId, firstConfig, 'configured', firstCommitId)
    expect(patchConfigRemote).toHaveBeenCalledTimes(callsBeforeStaleReplay)

    remoteWrite.resolve({ ...firstLeaderConfigStore.getProvider(providerId)!, config: firstConfig, status: 'configured' })
    await firstPersistence

    // ROOT CAUSE:
    //
    // An action can finish after its renderer loses leadership. Snapshot ownership prevents
    // that older response from replacing a model committed by the successor leader.
    await vi.waitFor(() => {
      expect(nextLeaderConfigStore.getProviderConfig(providerId)?.model).toBe('handoff-model')
      expect(nextLeaderHearingStore.activeTranscriptionModel).toBe('handoff-model')
      expect(followerConfigStore.getProviderConfig(providerId)?.model).toBe('handoff-model')
      expect(followerHearingStore.activeTranscriptionModel).toBe('handoff-model')
    })
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

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3891641792
  it('does not start Web Speech after the active provider changes (GitHub #2122)', async () => {
    const providerId = 'browser-web-speech-api'
    const context = createSyncedContext(`web-speech-provider-switch:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(context.runtime.isLeader()).toBe(true))
    setActivePinia(context.pinia)
    const providersStore = useProviderStore()
    const hearingStore = useHearingStore()
    await providersStore.initializeProvider(providerId)
    await providersStore.initializeProvider('openai-audio-transcription')
    await hearingStore.setActiveTranscriptionProvider(providerId, '')

    const modelSelection = deferred<void>()
    const selectModel = vi.spyOn(hearingStore, 'setTranscriptionModelForProvider')
      .mockImplementation(async () => modelSelection.promise)
    const pipeline = useHearingSpeechInputPipeline()
    const streaming = pipeline.transcribeForMediaStream({} as MediaStream, {
      consumerId: 'provider-switch-before-web-speech-start',
    })
    await vi.waitFor(() => expect(selectModel).toHaveBeenCalledWith(providerId, 'web-speech-api'))

    hearingStore.$patch({
      activeTranscriptionModel: 'whisper-1',
      activeTranscriptionProvider: 'openai-audio-transcription',
    })
    modelSelection.resolve()
    await streaming

    // ROOT CAUSE:
    //
    // Default-model selection is asynchronous. The active provider can change while it is
    // pending, so Web Speech must recheck ownership before starting browser recognition.
    expect(webSpeechMocks.stream).not.toHaveBeenCalled()
    expect(pipeline.error).toBe('Transcription provider changed before the request started.')
  })
})
