import type { Ref } from 'vue'

import { mount } from '@vue/test-utils'
import { until } from '@vueuse/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useTranscriptions } from './use-transcriptions'

function createMockStore() {
  return {
    activeTranscriptionProvider: undefined,
    configured: ref(false),
    autoSendEnabled: ref(true),
    autoSendDelay: ref(2000),
    initializeProvider: vi.fn(),
  }
}

const mockTranscribedContent = 'test content'
interface MockStreamingCallbacks {
  onSentenceEnd: (delta: string) => void
  onSpeechEnd?: (text: string) => void
  onTranscriptionUpdate?: (text: string) => void
}

function createMockPipeline() {
  return {
    removeStreamingTranscriptionConsumer: vi.fn(),
    transcribeForMediaStream: vi.fn().mockImplementation((_stream, options: MockStreamingCallbacks) => {
      options.onSentenceEnd(mockTranscribedContent)
    }),
    stopStreamingTranscription: vi.fn().mockResolvedValue(undefined),
    supportsStreamInput: ref(true),
  }
}

function createMockAudioDevice() {
  const instance = {
    enabled: ref(false),
    stream: ref(null),
    askPermission: vi.fn().mockResolvedValue(undefined),
    startStream: vi.fn(),
  }
  return instance
}

let mockHearingStore: ReturnType<typeof createMockStore>
let mockHearingPipeline: ReturnType<typeof createMockPipeline>
let mockAudioDevice: ReturnType<typeof createMockAudioDevice>
let mockProvidersStore: ReturnType<typeof createMockStore>

// Mock the modules
vi.mock('@proj-airi/stage-ui/stores/modules/hearing', () => ({
  useHearingStore: vi.fn().mockImplementation(() => mockHearingStore),
  useHearingSpeechInputPipeline: vi.fn().mockImplementation(() => mockHearingPipeline),
}))

vi.mock('@proj-airi/stage-ui/stores/providers/provider', () => ({
  useProviderStore: vi.fn().mockImplementation(() => mockProvidersStore),
}))

vi.mock('@proj-airi/stage-ui/stores/settings', () => ({
  useSettingsAudioDevice: vi.fn().mockImplementation(() => mockAudioDevice),
}))

vi.mock('pinia', () => ({
  storeToRefs: vi.fn().mockImplementation((val: any) => val),
}))

vi.mock('@vueuse/core', () => ({
  until: vi.fn(),
}))

// Global setup for jsdom environment
beforeAll(() => {
  // Ensure window is available
  if (typeof window === 'undefined') {
    ;(globalThis as any).window = {
      webkitSpeechRecognition: undefined,
      SpeechRecognition: undefined,
    }
  }
})

afterAll(() => {
  vi.clearAllMocks()
})

describe('useTranscriptions', () => {
  // Setup mutable instances before each test
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers() // Use fake timers for auto-send tests
    mockHearingStore = createMockStore()
    mockHearingPipeline = createMockPipeline()
    mockAudioDevice = createMockAudioDevice()
    mockProvidersStore = createMockStore()

    // Mock 'until' to resolve immediately for stream checks
    ;(until as any).mockImplementation((_source: Ref) => ({
      toBeTruthy: vi.fn().mockResolvedValue(undefined),
    }))

    // Mock SpeechRecognition for browser tests
    if (typeof window !== 'undefined') {
      (window as any).SpeechRecognition = function () {
        this.start = vi.fn()
        this.stop = vi.fn()
        this.onresult = null
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  const createOptions = (isTamagotchi = false) => ({
    messageInputRef: ref(''),
    sendMessage: vi.fn(),
    isStageTamagotchi: ref(isTamagotchi),
  })

  describe('initialization', () => {
    it('should initialize with isListening false', () => {
      const { isListening } = useTranscriptions(createOptions())

      expect(isListening.value).toBe(false)
    })

    it('should expose startListening and stopListening', () => {
      const { startStreamingTranscription, stopStreamingTranscription } = useTranscriptions(createOptions())

      expect(startStreamingTranscription).toBeInstanceOf(Function)
      expect(stopStreamingTranscription).toBeInstanceOf(Function)
    })
  })

  describe('auto-Configuration (Web Speech API)', () => {
    it('should auto-configure Web Speech API if no provider is set', async () => {
      mockHearingStore.configured.value = false
      mockAudioDevice.enabled.value = true

      const { startStreamingTranscription }
        = useTranscriptions(createOptions())
      await startStreamingTranscription()

      expect(mockProvidersStore.initializeProvider).toHaveBeenCalledWith('browser-web-speech-api')
      expect(mockHearingStore.activeTranscriptionProvider).toBe('browser-web-speech-api')
    })

    it('should fail gracefully if Web Speech API is not available', async () => {
      // Setup: Tamagotchi mode or no API
      if (typeof window !== 'undefined') {
        delete (window as any).SpeechRecognition
        delete (window as any).webkitSpeechRecognition
      }

      mockHearingStore.configured.value = false
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true

      const { isListening, startStreamingTranscription }
        = useTranscriptions(createOptions())
      await startStreamingTranscription()

      expect(isListening.value).toBe(false)
      expect(mockHearingPipeline.transcribeForMediaStream).not.toHaveBeenCalled()
    })

    it('should handle tamagotchi', async () => {
      mockHearingStore.configured.value = false
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true

      const { isListening, stopStreamingTranscription }
        = useTranscriptions(createOptions(true))
      await stopStreamingTranscription()
      expect(isListening.value).toBe(false)
    })
  })

  describe('streaming Logic', () => {
    it('should start streaming if stream exists and provider supports it', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { isListening, startStreamingTranscription } = useTranscriptions(createOptions())

      await startStreamingTranscription()

      await nextTick()
      expect(isListening.value).toBe(true)
      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'stream-1' }),
        expect.any(Object),
      )
    })

    it('should request permission if stream is missing', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = null
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { startStreamingTranscription } = useTranscriptions(createOptions())

      await startStreamingTranscription()
      await nextTick()

      expect(mockAudioDevice.askPermission).toHaveBeenCalled()
      expect(mockAudioDevice.startStream).toHaveBeenCalled()
    })

    it('should stop streaming if stream is missing after permission', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = null
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true;

      // simulate failure (stream never appears)
      (until as any).mockImplementation(() => ({
        toBeTruthy: vi.fn().mockRejectedValue(new Error('Timeout')),
      }))

      const { isListening, startStreamingTranscription } = useTranscriptions(createOptions())

      await startStreamingTranscription()
      await nextTick()

      expect(isListening.value).toBe(false)
    })
  })

  describe('transcription & Input', () => {
    // Microphone input is already enabled in these tests, so creating the
    // composable auto-starts the streaming session; no manual start exists.
    it('should append transcribed text to messageInputRef', async () => {
      const mockInput = ref('')
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput })
      await nextTick()

      expect(mockInput.value).toBe(mockTranscribedContent)
    })

    it('should append transcribed text with a space when input contains value', async () => {
      const prependText = 'prepend text'
      const mockInput = ref(prependText)
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput })
      await nextTick()

      expect(mockInput.value).toBe(`${prependText} ${mockTranscribedContent}`)
    })

    it('replaces volatile snapshots when the provider corrects text', async () => {
      // ROOT CAUSE:
      //
      // The input consumer only accepted final deltas. It had no operation for
      // replacing a provider-owned draft when the provider corrected that text.
      const mockInput = ref('prefix')
      const observedInputs: string[] = []
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true
      mockHearingPipeline.transcribeForMediaStream.mockImplementation((_stream, options: MockStreamingCallbacks) => {
        options.onTranscriptionUpdate?.('今天天气很号')
        observedInputs.push(mockInput.value)
        options.onTranscriptionUpdate?.('今天天气很好')
        observedInputs.push(mockInput.value)
        options.onSentenceEnd('今天天气很好')
      })

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput })
      await nextTick()

      expect(observedInputs).toEqual(['prefix 今天天气很号', 'prefix 今天天气很好'])
      expect(mockInput.value).toBe('prefix 今天天气很好')
    })

    it('preserves manual input changes during a volatile transcription', async () => {
      const mockInput = ref('prefix')
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true
      mockHearingPipeline.transcribeForMediaStream.mockImplementation((_stream, options: MockStreamingCallbacks) => {
        options.onTranscriptionUpdate?.('provider draft')
        mockInput.value = 'manual edit'
        options.onTranscriptionUpdate?.('provider correction')
        options.onSentenceEnd('provider final')
      })

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput })
      await nextTick()

      expect(mockInput.value).toBe('manual edit')
    })

    it('should trigger auto-send after delay', async () => {
      const mockInput = ref('')
      const mockSendMessage = vi.fn()

      mockHearingStore.autoSendDelay.value = 500
      mockHearingStore.configured.value = true
      mockHearingStore.autoSendEnabled.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput, sendMessage: mockSendMessage })
      await nextTick()

      expect(mockSendMessage).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)

      expect(mockSendMessage).toHaveBeenCalled()
    })

    it('should clear pending auto-send if disabled', async () => {
      const mockInput = ref('')
      const mockSendMessage = vi.fn()

      mockHearingStore.autoSendDelay.value = 500
      mockHearingStore.configured.value = true
      mockHearingStore.autoSendEnabled.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      useTranscriptions({ ...createOptions(), messageInputRef: mockInput, sendMessage: mockSendMessage })
      await nextTick()

      // Disable auto-send before timeout
      mockHearingStore.autoSendEnabled.value = false

      vi.advanceTimersByTime(1000)

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should stop streaming and clear timeout', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { isListening, startStreamingTranscription, stopStreamingTranscription } = useTranscriptions(createOptions())

      await startStreamingTranscription()
      await nextTick()
      expect(isListening.value).toBe(true)

      await stopStreamingTranscription()
      await nextTick()
      expect(isListening.value).toBe(false)
      expect(mockHearingPipeline.stopStreamingTranscription).toHaveBeenCalledWith(true)
      expect(mockHearingPipeline.removeStreamingTranscriptionConsumer).toHaveBeenCalledOnce()
    })

    it('should stop streaming on unmount', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const app = mount({
        setup() {
          const { startStreamingTranscription } = useTranscriptions(createOptions())
          startStreamingTranscription()
        },
        template: '<div></div>',
      })
      await nextTick()
      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalled()

      app.unmount()
      await nextTick()
      expect(mockHearingPipeline.stopStreamingTranscription).toHaveBeenCalled()
      expect(mockHearingPipeline.removeStreamingTranscriptionConsumer).toHaveBeenCalled()
    })
  })

  describe('reactive watchers', () => {
    // ROOT CAUSE:
    //
    // If nothing calls startStreamingTranscription, live speech input can
    // never start and the Web Speech API fallback is unreachable.
    // This happened because PR #2014 removed the transcription toggle button
    // and its `toggleTranscription` emit from HearingConfig, while ChatArea
    // and MobileInteractiveArea kept binding `@toggle-transcription` to it.
    // Vue drops listeners for events a component never emits, so the binding
    // was silently dead and `isListening` could never become true.
    //
    // We fixed this by starting streaming transcription from a watcher on the
    // microphone `enabled` state inside useTranscriptions, so enabling the
    // microphone is the single entry point for live speech input.
    it('starts streaming when microphone input becomes enabled', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = false
      mockHearingPipeline.supportsStreamInput.value = true

      const { isListening } = useTranscriptions(createOptions())

      expect(mockHearingPipeline.transcribeForMediaStream).not.toHaveBeenCalled()

      mockAudioDevice.enabled.value = true
      await nextTick()
      await nextTick()

      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalled()
      expect(isListening.value).toBe(true)
    })

    it('starts streaming on setup when microphone input is already enabled', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { isListening } = useTranscriptions(createOptions())
      await nextTick()

      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalled()
      expect(isListening.value).toBe(true)
    })

    it('falls back to Web Speech API when the microphone is enabled with no provider configured', async () => {
      mockHearingStore.configured.value = false
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = false

      useTranscriptions(createOptions())

      mockAudioDevice.enabled.value = true
      await nextTick()
      await nextTick()
      await nextTick()

      expect(mockProvidersStore.initializeProvider).toHaveBeenCalledWith('browser-web-speech-api')
      expect(mockHearingStore.activeTranscriptionProvider).toBe('browser-web-speech-api')
      expect(mockHearingPipeline.transcribeForMediaStream).toHaveBeenCalled()
    })

    it('should stop listening if microphone is disabled', async () => {
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { isListening, startStreamingTranscription } = useTranscriptions(createOptions())

      await startStreamingTranscription()

      await nextTick()
      expect(isListening.value).toBe(true)

      mockAudioDevice.enabled.value = false

      await nextTick()
      expect(isListening.value).toBe(false)
    })
  })
})
