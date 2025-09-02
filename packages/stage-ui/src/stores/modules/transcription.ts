import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Types for Whisper/KoboldCPP
export interface WhisperConfig {
  provider: 'tauri' | 'koboldcpp'
  tauriModel: 'tiny' | 'base' | 'small' | 'medium' | 'large'
  koboldcppBaseUrl: string
  language: 'auto' | 'ru' | 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt' | 'nl' | 'pl'
  temperature: number
  maxTokens: number
}

export interface TranscriptionRequest {
  audio: Blob | File
  language?: string
  model?: string
  temperature?: number
}

export interface TranscriptionResult {
  text: string
  language?: string
  confidence?: number
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

export interface TranscriptionState {
  isTranscribing: boolean
  isRecording: boolean
  lastResult: TranscriptionResult | null
  error: string | null
  mediaRecorder: MediaRecorder | null
  recordingStream: MediaStream | null
}

export const useTranscriptionStore = defineStore('transcription', () => {
  // Configuration
  const whisperConfig = useLocalStorage<WhisperConfig>('transcription/whisper-config', {
    provider: 'koboldcpp',
    tauriModel: 'base',
    koboldcppBaseUrl: 'http://127.0.0.1:5001',
    language: 'auto',
    temperature: 0.0,
    maxTokens: 448,
  })

  // State
  const state = ref<TranscriptionState>({
    isTranscribing: false,
    isRecording: false,
    lastResult: null,
    error: null,
    mediaRecorder: null,
    recordingStream: null,
  })

  // Available models for Tauri Whisper
  const availableModels = ref([
    { id: 'tiny', name: 'Tiny', description: 'Быстрый, минимальное качество (~39 MB)' },
    { id: 'base', name: 'Base', description: 'Базовый, хорошее качество (~74 MB)' },
    { id: 'small', name: 'Small', description: 'Средний, отличное качество (~244 MB)' },
    { id: 'medium', name: 'Medium', description: 'Большой, высокое качество (~769 MB)' },
    { id: 'large', name: 'Large', description: 'Максимальный, лучшее качество (~1550 MB)' },
  ])

  // Available languages
  const availableLanguages = ref([
    { id: 'auto', name: 'Автоопределение', code: 'auto' },
    { id: 'ru', name: 'Русский', code: 'ru' },
    { id: 'en', name: 'English', code: 'en' },
    { id: 'de', name: 'Deutsch', code: 'de' },
    { id: 'fr', name: 'Français', code: 'fr' },
    { id: 'es', name: 'Español', code: 'es' },
    { id: 'it', name: 'Italiano', code: 'it' },
    { id: 'pt', name: 'Português', code: 'pt' },
    { id: 'nl', name: 'Nederlands', code: 'nl' },
    { id: 'pl', name: 'Polski', code: 'pl' },
  ])

  // Computed
  const currentModel = computed(() =>
    availableModels.value.find(m => m.id === whisperConfig.value.tauriModel) || availableModels.value[1],
  )

  const currentLanguage = computed(() =>
    availableLanguages.value.find(l => l.id === whisperConfig.value.language) || availableLanguages.value[0],
  )

  const isReady = computed(() => {
    if (whisperConfig.value.provider === 'tauri') {
      return true // Tauri is always ready if properly configured
    }
    return !!whisperConfig.value.koboldcppBaseUrl
  })

  // Actions
  async function transcribeWithTauri(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!window.__TAURI__) {
      throw new Error('Tauri API недоступен')
    }

    try {
      // Convert audio to ArrayBuffer for Tauri
      const audioBuffer = await request.audio.arrayBuffer()
      const audioArray = new Uint8Array(audioBuffer)

      // Call Tauri command (assuming it exists)
      const result = await window.__TAURI__.tauri.invoke('transcribe_audio', {
        audioData: Array.from(audioArray),
        model: request.model || whisperConfig.value.tauriModel,
        language: request.language !== 'auto' ? request.language : undefined,
        temperature: request.temperature || whisperConfig.value.temperature,
      })

      return {
        text: result.text || '',
        language: result.language,
        confidence: result.confidence,
        segments: result.segments,
      }
    }
    catch (error) {
      console.error('Tauri transcription error:', error)
      throw new Error(error instanceof Error ? error.message : 'Ошибка Tauri транскрипции')
    }
  }

  async function transcribeWithKoboldCPP(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const baseUrl = whisperConfig.value.koboldcppBaseUrl.replace(/\/$/, '')

    try {
      const formData = new FormData()

      // Ensure proper file format
      let audioFile = request.audio
      if (audioFile instanceof Blob) {
        audioFile = new File([audioFile], 'recording.wav', {
          type: 'audio/wav',
          lastModified: Date.now(),
        })
      }

      formData.append('file', audioFile)
      formData.append('model', 'whisper-1')

      if (request.language && request.language !== 'auto') {
        formData.append('language', request.language)
      }

      if (request.temperature !== undefined) {
        formData.append('temperature', String(request.temperature))
      }

      // Try multiple endpoints
      const endpoints = [
        '/v1/audio/transcriptions',
        '/api/extra/transcribe',
        '/api/v1/audio/transcriptions',
      ]

      let lastError: Error | null = null

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(60000), // 60 second timeout
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const result = await response.json()

          // Handle different response formats
          const text = result.text || result.transcription || result.transcript || ''

          return {
            text,
            language: result.language,
            confidence: result.confidence,
            segments: result.segments,
          }
        }
        catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          console.warn(`KoboldCPP endpoint ${endpoint} failed:`, error)
          continue
        }
      }

      throw lastError || new Error('Все эндпоинты KoboldCPP недоступны')
    }
    catch (error) {
      console.error('KoboldCPP transcription error:', error)
      throw new Error(error instanceof Error ? error.message : 'Ошибка KoboldCPP транскрипции')
    }
  }

  async function transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!isReady.value) {
      throw new Error('Система транскрипции не настроена')
    }

    state.value.isTranscribing = true
    state.value.error = null

    try {
      let result: TranscriptionResult

      if (whisperConfig.value.provider === 'tauri') {
        result = await transcribeWithTauri(request)
      }
      else {
        result = await transcribeWithKoboldCPP(request)
      }

      state.value.lastResult = result
      return result
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
      state.value.error = errorMessage
      throw error
    }
    finally {
      state.value.isTranscribing = false
    }
  }

  async function startRecording(): Promise<void> {
    if (state.value.isRecording) {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      state.value.recordingStream = stream

      // Try different audio formats
      const supportedFormats = [
        'audio/wav',
        'audio/webm;codecs=pcm',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ]

      let selectedFormat = ''
      for (const format of supportedFormats) {
        if (MediaRecorder.isTypeSupported(format)) {
          selectedFormat = format
          break
        }
      }

      const mediaRecorder = selectedFormat
        ? new MediaRecorder(stream, { mimeType: selectedFormat })
        : new MediaRecorder(stream)

      state.value.mediaRecorder = mediaRecorder

      const audioChunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunks, { type: mimeType })

        if (audioBlob.size > 0) {
          try {
            await transcribe({ audio: audioBlob })
          }
          catch (error) {
            console.error('Auto-transcription failed:', error)
          }
        }

        // Cleanup
        stream.getTracks().forEach(track => track.stop())
        state.value.recordingStream = null
        state.value.mediaRecorder = null
        state.value.isRecording = false
      }

      mediaRecorder.start()
      state.value.isRecording = true
      state.value.error = null
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка доступа к микрофону'
      state.value.error = errorMessage
      throw error
    }
  }

  function stopRecording(): void {
    if (state.value.mediaRecorder && state.value.isRecording) {
      state.value.mediaRecorder.stop()
    }
  }

  async function transcribeFile(file: File): Promise<TranscriptionResult> {
    return transcribe({ audio: file })
  }

  async function testConnection(): Promise<boolean> {
    if (whisperConfig.value.provider === 'tauri') {
      // Test Tauri availability
      return !!window.__TAURI__
    }

    // Test KoboldCPP connection
    try {
      const baseUrl = whisperConfig.value.koboldcppBaseUrl.replace(/\/$/, '')
      const endpoints = ['/api/v1/model', '/api/v1/info/version', '/v1/models']

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          })
          if (response.ok) {
            return true
          }
        }
        catch {
          continue
        }
      }
      return false
    }
    catch {
      return false
    }
  }

  // Update configuration
  function updateConfig(newConfig: Partial<WhisperConfig>): void {
    Object.assign(whisperConfig.value, newConfig)
  }

  return {
    // Configuration
    whisperConfig,

    // State
    state: computed(() => state.value),
    availableModels: computed(() => availableModels.value),
    availableLanguages: computed(() => availableLanguages.value),
    currentModel,
    currentLanguage,
    isReady,

    // Actions
    transcribe,
    transcribeWithTauri,
    transcribeWithKoboldCPP,
    startRecording,
    stopRecording,
    transcribeFile,
    testConnection,
    updateConfig,
  }
})

export type TranscriptionStore = ReturnType<typeof useTranscriptionStore>
