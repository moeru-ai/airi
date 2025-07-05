import { computed, readonly, ref } from 'vue'

import { useTauriCore } from '../tauri'
import { mapLanguageCodeToName } from './extract-whisper-languages'

export interface WhisperConfig {
  modelSize: 'tiny' | 'base' | 'small' | 'medium' | 'large'
  language?: string
  temperature: number
  beamSize: number
  bestOf: number
}

export interface VADSegment {
  id: string
  audioData: Float32Array
  startTime: number
  endTime: number
  probability: number
  isComplete: boolean
}

export interface TranscriptionResult {
  id: string
  segmentId: string
  text: string
  language?: string
  processingTimeMs: number
  timestamp: number
}

export function useWhisperTranscription(config: Partial<WhisperConfig> = {}) {
  const { invoke } = useTauriCore()

  const isModelLoaded = ref(false)
  const isLoading = ref(false)
  const error = ref('')
  const isProcessing = ref(false)

  const whisperConfig = ref<WhisperConfig>({
    modelSize: 'base',
    language: undefined, // Auto-detect
    temperature: 0.0,
    beamSize: 5,
    bestOf: 5,
    ...config,
  })

  const transcriptionQueue = ref<VADSegment[]>([])
  const transcriptionResults = ref<TranscriptionResult[]>([])
  const maxResults = 50

  const onTranscriptionResultHooks = ref<((result: TranscriptionResult) => void)[]>([])

  const currentTranscription = computed(() =>
    transcriptionResults.value[transcriptionResults.value.length - 1],
  )

  async function loadModel(modelType: 'base' | 'largev3' | 'tiny' | 'medium' = 'base') {
    if (isModelLoaded.value || isLoading.value)
      return

    isLoading.value = true
    error.value = ''

    try {
      await invoke('plugin:proj-airi-tauri-plugin-audio-transcription|load_model_whisper', { modelType })
      isModelLoaded.value = true
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Failed to load Whisper model:', err)
    }
    finally {
      isLoading.value = false
    }
  }

  async function transcribeSegment(segment: VADSegment, locale: string): Promise<TranscriptionResult | null> {
    if (!isModelLoaded.value || !segment.isComplete)
      return null

    const startTime = performance.now()

    try {
      isProcessing.value = true

      const audioArray = Array.from(segment.audioData)
      const [result, language] = await invoke('plugin:proj-airi-tauri-plugin-audio-transcription|audio_transcription', {
        chunk: audioArray,
        language: mapLanguageCodeToName(locale),
      }) || ['', '']

      const transcription: TranscriptionResult = {
        id: `transcription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        segmentId: segment.id,
        text: result?.trim() || '',
        language: language?.trim() || '',
        processingTimeMs: performance.now() - startTime,
        timestamp: Date.now(),
      }

      // Add to results
      transcriptionResults.value.push(transcription)
      if (transcriptionResults.value.length > maxResults) {
        transcriptionResults.value.shift()
      }

      // Notify hooks
      onTranscriptionResultHooks.value.forEach(cb => cb(transcription))

      return transcription
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      console.error('Transcription error:', err)
      return null
    }
    finally {
      isProcessing.value = false
    }
  }

  async function transcribeAudioData(audioData: Float32Array, locale: string): Promise<TranscriptionResult | null> {
    if (!isModelLoaded.value)
      return null

    const fakeSegment: VADSegment = {
      id: `manual_${Date.now()}`,
      audioData,
      startTime: 0,
      endTime: (audioData.length / 16000) * 1000,
      probability: 1.0,
      isComplete: true,
    }

    return await transcribeSegment(fakeSegment, locale)
  }

  function queueSegment(segment: VADSegment, locale: string) {
    if (segment.isComplete) {
      transcriptionQueue.value.push(segment)
      processQueue(locale)
    }
  }

  async function processQueue(locale: string) {
    if (isProcessing.value || transcriptionQueue.value.length === 0)
      return

    const segment = transcriptionQueue.value.shift()
    if (segment) {
      await transcribeSegment(segment, locale)
      // Process next item in queue
      if (transcriptionQueue.value.length > 0) {
        setTimeout(() => processQueue(locale), 100)
      }
    }
  }

  async function onTranscriptionResult(cb: (result: TranscriptionResult) => void) {
    onTranscriptionResultHooks.value.push(cb)

    // Immediately call with current results
    transcriptionResults.value.forEach(result => cb(result))

    // Return a cleanup function
    return () => {
      const index = onTranscriptionResultHooks.value.indexOf(cb)
      if (index !== -1) {
        onTranscriptionResultHooks.value.splice(index, 1)
      }
    }
  }

  function clearResults() {
    transcriptionResults.value = []
  }

  function clearQueue() {
    transcriptionQueue.value = []
  }

  function getResultBySegmentId(segmentId: string): TranscriptionResult | undefined {
    return transcriptionResults.value.find(r => r.segmentId === segmentId)
  }

  return {
    // State
    isModelLoaded: readonly(isModelLoaded),
    isLoading: readonly(isLoading),
    isProcessing: readonly(isProcessing),
    error: readonly(error),

    // Configuration
    config: whisperConfig,

    // Results
    transcriptionResults: readonly(transcriptionResults),
    currentTranscription,
    queueLength: computed(() => transcriptionQueue.value.length),

    // Controls
    loadModel,
    transcribeSegment,
    transcribeAudioData,
    queueSegment,
    clearResults,
    clearQueue,
    getResultBySegmentId,
    onTranscriptionResult,
  }
}
