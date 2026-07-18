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
function createMockPipeline() {
  return {
    transcribeForMediaStream: vi.fn().mockImplementation((_stream, options: { onSentenceEnd: (delta: string) => void }) => {
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

vi.mock('@proj-airi/stage-ui/stores/providers', () => ({
  useProvidersStore: vi.fn().mockImplementation(() => mockProvidersStore),
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
    it('should append transcribed text to messageInputRef', async () => {
      const mockInput = ref('')
      mockHearingStore.configured.value = true
      mockAudioDevice.stream.value = { id: 'stream-1' } as any
      mockAudioDevice.enabled.value = true
      mockHearingPipeline.supportsStreamInput.value = true

      const { startStreamingTranscription }
        = useTranscriptions({ ...createOptions(), messageInputRef: mockInput })

      await startStreamingTranscription()
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

      const { startStreamingTranscription }
        = useTranscriptions({ ...createOptions(), messageInputRef: mockInput })

      await startStreamingTranscription()
      await nextTick()

      expect(mockInput.value).toBe(`${prependText} ${mockTranscribedContent}`)
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

      const { startStreamingTranscription }
        = useTranscriptions({ ...createOptions(), messageInputRef: mockInput, sendMessage: mockSendMessage })

      await startStreamingTranscription()
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

      const { startStreamingTranscription }
        = useTranscriptions({ ...createOptions(), messageInputRef: mockInput, sendMessage: mockSendMessage })

      await startStreamingTranscription()
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
    })
  })

  describe('reactive watchers', () => {
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
