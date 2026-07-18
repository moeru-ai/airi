// @vitest-environment jsdom

import type { SourcesOptions } from 'electron'
import type { App, MaybeRefOrGetter, Ref } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick, ref, toValue } from 'vue'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

let companionStore: ReturnType<typeof createCompanionStore>
let screenCapture: ReturnType<typeof createScreenCapture>
let mountedApp: App<Element> | null = null
let runtimeVideoRef: Ref<HTMLVideoElement | null> | null = null
let capturedSourcesOptions: MaybeRefOrGetter<SourcesOptions> | null = null

const requestIngest = vi.fn()
const runVisionInference = vi.fn()

function createCompanionStore() {
  return {
    enabled: ref(true),
    intervalMs: ref(60_000),
    sourceId: ref('screen:1:0'),
    sourceKind: ref<'screen' | 'window'>('screen'),
    promptTemplate: ref(''),
    publishRuntimeState: vi.fn(),
    setRuntimeNextTickAt: vi.fn(),
    setRuntimeRunning: vi.fn(),
    setRuntimeCapturing: vi.fn(),
    markRuntimeUnavailable: vi.fn(),
    recordCapture: vi.fn(),
    recordSkip: vi.fn(),
    recordError: vi.fn(),
    setIntervalMs: vi.fn(),
  }
}

function createScreenCapture() {
  const sources = ref([
    { id: 'screen:1:0', name: 'Screen 1' },
    { id: 'window:2:0', name: 'Window 2' },
  ])
  const activeSourceId = ref('screen:1:0')

  return {
    sources,
    activeSourceId,
    activeSource: ref({ id: 'screen:1:0', name: 'Screen 1' }),
    hasFetchedOnce: ref(true),
    refetchSources: vi.fn(async () => {}),
    startStream: vi.fn(async () => ({}) as MediaStream),
    captureFrame: vi.fn(() => 'data:image/jpeg;base64,frame'),
    stopStream: vi.fn(),
    cleanup: vi.fn(),
  }
}

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: object) => store,
  }
})

vi.mock('@proj-airi/stage-ui/composables/vision/use-vision-inference', () => ({
  useVisionInference: () => ({ runVisionInference }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({
    sending: ref(false),
    pendingQueuedSendCount: ref(0),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({
    isReady: true,
    initialize: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/settings', () => ({
  useSettingsGeneral: () => ({ language: ref('en') }),
}))

vi.mock('../stores/chat-sync', () => ({
  useChatSyncStore: () => ({ requestIngest }),
}))

vi.mock('../stores/companion-mode', async () => {
  const actual = await vi.importActual<typeof import('../stores/companion-mode')>('../stores/companion-mode')
  return {
    ...actual,
    useCompanionModeStore: () => companionStore,
  }
})

vi.mock('./use-vision-screen-capture', () => ({
  useVisionScreenCapture: (options: MaybeRefOrGetter<SourcesOptions>) => {
    capturedSourcesOptions = options
    return screenCapture
  },
}))

describe('useCompanionModeRuntime', async () => {
  const { useCompanionModeRuntime } = await import('./use-companion-mode-runtime')

  function createCaptureVideo() {
    const video = document.createElement('video')
    Object.defineProperties(video, {
      srcObject: {
        configurable: true,
        writable: true,
        value: null,
      },
      readyState: {
        configurable: true,
        value: HTMLMediaElement.HAVE_CURRENT_DATA,
      },
      videoWidth: {
        configurable: true,
        value: 1280,
      },
      videoHeight: {
        configurable: true,
        value: 720,
      },
      play: {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      },
      pause: {
        configurable: true,
        value: vi.fn(),
      },
    })
    return video
  }

  async function mountRuntime() {
    const host = document.createElement('div')
    mountedApp = createApp(defineComponent({
      setup() {
        const runtime = useCompanionModeRuntime()
        runtimeVideoRef = runtime.videoRef
        return () => null
      },
    }))
    mountedApp.mount(host)
    const video = createCaptureVideo()
    runtimeVideoRef!.value = video
    await nextTick()
    return video
  }

  beforeEach(() => {
    companionStore = createCompanionStore()
    screenCapture = createScreenCapture()
    runtimeVideoRef = null
    capturedSourcesOptions = null
    requestIngest.mockReset().mockResolvedValue(undefined)
    runVisionInference.mockReset().mockResolvedValue('The user is viewing a code editor.')
  })

  afterEach(() => {
    mountedApp?.unmount()
    mountedApp = null
    vi.useRealTimers()
  })

  it('routes the frame through vision and sends only its summary to chat', async () => {
    companionStore.sourceKind.value = 'window'
    companionStore.sourceId.value = 'window:2:0'
    screenCapture.activeSource.value = { id: 'window:2:0', name: 'Window 2' }
    screenCapture.startStream.mockImplementation(async () => {
      expect(screenCapture.activeSourceId.value).toBe('window:2:0')
      return {} as MediaStream
    })

    await mountRuntime()

    await vi.waitFor(() => expect(requestIngest).toHaveBeenCalledTimes(1))

    expect(toValue(capturedSourcesOptions!)).toMatchObject({
      types: ['screen', 'window'],
      thumbnailSize: {
        width: 0,
        height: 0,
      },
    })
    expect(screenCapture.startStream).toHaveBeenCalledTimes(1)
    expect(screenCapture.captureFrame).toHaveBeenCalledWith(
      expect.any(HTMLVideoElement),
      0.72,
      768,
      432,
    )
    expect(runVisionInference).toHaveBeenCalledWith(expect.objectContaining({
      imageDataUrl: 'data:image/jpeg;base64,frame',
      workloadId: 'screen:interpret',
      abortSignal: expect.any(AbortSignal),
    }))
    expect(requestIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('The user is viewing a code editor.'),
        hidden: true,
      }),
      { abortSignal: expect.any(AbortSignal) },
    )
    expect(requestIngest.mock.calls[0]?.[0]).not.toHaveProperty('attachments')
    expect(companionStore.recordCapture).toHaveBeenCalledTimes(1)
  })

  it('clears a stale source error when Companion Mode starts already enabled', async () => {
    await mountRuntime()

    expect(companionStore.recordError).toHaveBeenCalledWith(null)
  })

  it('does not start vision or chat after being disabled during capture', async () => {
    const stream = deferred<MediaStream>()
    screenCapture.startStream.mockReturnValue(stream.promise)
    await mountRuntime()
    await vi.waitFor(() => expect(screenCapture.startStream).toHaveBeenCalledTimes(1))

    companionStore.enabled.value = false
    await nextTick()
    stream.resolve({} as MediaStream)
    await nextTick()
    await Promise.resolve()

    expect(runVisionInference).not.toHaveBeenCalled()
    expect(requestIngest).not.toHaveBeenCalled()
    expect(companionStore.recordCapture).not.toHaveBeenCalled()
  })

  it('detaches an ended preview stream before reacquiring the selected source', async () => {
    vi.useFakeTimers()
    screenCapture.startStream.mockImplementation(async () => {
      expect(runtimeVideoRef!.value?.srcObject).toBeNull()
      return {} as MediaStream
    })

    const video = await mountRuntime()
    Object.assign(video, {
      srcObject: {
        getVideoTracks: () => [{ readyState: 'ended' }],
      } as unknown as MediaStream,
    })

    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(screenCapture.startStream).toHaveBeenCalledTimes(1))

    expect(video.pause).toHaveBeenCalledTimes(1)
  })

  it('aborts active vision inference when Companion Mode is disabled', async () => {
    const vision = deferred<string>()
    let receivedSignal: AbortSignal | undefined
    runVisionInference.mockImplementation(({ abortSignal }) => {
      receivedSignal = abortSignal
      abortSignal.addEventListener('abort', () => vision.reject(abortSignal.reason), { once: true })
      return vision.promise
    })
    await mountRuntime()
    await vi.waitFor(() => expect(runVisionInference).toHaveBeenCalledTimes(1))

    companionStore.enabled.value = false
    await nextTick()
    await vi.waitFor(() => expect(receivedSignal?.aborted).toBe(true))

    expect(requestIngest).not.toHaveBeenCalled()
    expect(companionStore.recordCapture).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // The runtime previously discarded only the result of a late hidden chat
  // send. The provider request itself remained active and could still append
  // and speak an assistant response after Companion Mode was disabled.
  it('aborts active hidden chat ingest when Companion Mode is disabled', async () => {
    const chat = deferred<void>()
    let receivedSignal: AbortSignal | undefined
    requestIngest.mockImplementation((_payload, options) => {
      receivedSignal = options?.abortSignal
      options?.abortSignal?.addEventListener('abort', () => {
        chat.reject(options.abortSignal.reason)
      }, { once: true })
      return chat.promise
    })
    await mountRuntime()
    await vi.waitFor(() => expect(requestIngest).toHaveBeenCalledTimes(1))

    companionStore.enabled.value = false
    await nextTick()
    await vi.waitFor(() => expect(receivedSignal?.aborted).toBe(true))

    expect(companionStore.recordCapture).not.toHaveBeenCalled()
  })

  it('stops Companion Mode and asks the character to explain an unavailable window', async () => {
    companionStore.sourceKind.value = 'window'
    companionStore.sourceId.value = 'window:2:0'
    screenCapture.activeSourceId.value = 'window:2:0'
    screenCapture.activeSource.value = { id: 'window:2:0', name: 'Window 2' }
    screenCapture.startStream.mockRejectedValue(new Error('Window is minimized'))

    await mountRuntime()
    await vi.waitFor(() => expect(requestIngest).toHaveBeenCalledTimes(1))

    expect(runVisionInference).not.toHaveBeenCalled()
    expect(requestIngest).toHaveBeenCalledWith(expect.objectContaining({
      hidden: true,
      text: expect.stringContaining('"Window 2" cannot be observed'),
    }))
    expect(companionStore.recordError).toHaveBeenCalledWith('Window is minimized')
    expect(companionStore.recordSkip).toHaveBeenCalledWith(
      expect.any(Number),
      'Stopped Companion Mode because the selected observation source is unavailable.',
    )
    expect(companionStore.enabled.value).toBe(false)
    expect(companionStore.sourceKind.value).toBe('window')
    expect(companionStore.sourceId.value).toBe('window:2:0')
  })

  it('stops rather than replacing an explicitly selected screen that no longer exists', async () => {
    companionStore.sourceId.value = 'screen:2:0'
    screenCapture.activeSourceId.value = 'screen:1:0'

    await mountRuntime()
    await vi.waitFor(() => expect(requestIngest).toHaveBeenCalledTimes(1))

    expect(screenCapture.startStream).not.toHaveBeenCalled()
    expect(companionStore.enabled.value).toBe(false)
    expect(companionStore.sourceKind.value).toBe('screen')
    expect(companionStore.sourceId.value).toBe('screen:2:0')
    expect(requestIngest).toHaveBeenCalledWith(expect.objectContaining({
      hidden: true,
      text: expect.stringContaining('the selected screen cannot be observed'),
    }))
  })

  it('clears the source error and captures normally when Companion Mode is enabled again', async () => {
    companionStore.sourceKind.value = 'window'
    companionStore.sourceId.value = 'window:2:0'
    screenCapture.activeSourceId.value = 'window:2:0'
    screenCapture.activeSource.value = { id: 'window:2:0', name: 'Window 2' }
    screenCapture.startStream.mockRejectedValueOnce(new Error('Window is minimized'))

    await mountRuntime()
    await vi.waitFor(() => expect(companionStore.enabled.value).toBe(false))

    companionStore.sourceKind.value = 'screen'
    companionStore.sourceId.value = 'screen:1:0'
    screenCapture.activeSource.value = { id: 'screen:1:0', name: 'Screen 1' }
    screenCapture.startStream.mockResolvedValue({} as MediaStream)

    companionStore.enabled.value = true
    await vi.waitFor(() => expect(companionStore.recordCapture).toHaveBeenCalledTimes(1))

    expect(companionStore.recordError).toHaveBeenCalledWith(null)
    expect(requestIngest).toHaveBeenCalledTimes(2)
  })
})
