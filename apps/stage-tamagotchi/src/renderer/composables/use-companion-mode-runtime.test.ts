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
    expect(requestIngest).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('The user is viewing a code editor.'),
      hidden: true,
    }))
    expect(requestIngest.mock.calls[0]?.[0]).not.toHaveProperty('attachments')
    expect(companionStore.recordCapture).toHaveBeenCalledTimes(1)
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

  it('hides the minimized-window fallback instruction', async () => {
    companionStore.sourceKind.value = 'window'
    companionStore.sourceId.value = 'window:2:0'
    screenCapture.activeSourceId.value = 'window:2:0'
    screenCapture.activeSource.value = { id: 'window:2:0', name: 'Window 2' }
    screenCapture.startStream.mockRejectedValue(new Error('Window is minimized'))

    await mountRuntime()
    await vi.waitFor(() => expect(requestIngest).toHaveBeenCalledTimes(1))

    expect(requestIngest).toHaveBeenCalledWith(expect.objectContaining({
      hidden: true,
    }))
    expect(runVisionInference).not.toHaveBeenCalled()
  })
})
