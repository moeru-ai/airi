import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Types for Silero TTS
export interface SileroTTSConfig {
  baseUrl: string
  speaker: string
  sampleRate: number
  format: 'wav' | 'mp3' | 'ogg'
}

export interface SileroSpeaker {
  name: string
  language: string
  gender: 'male' | 'female'
  description?: string
}

export interface SpeechRequest {
  text: string
  speaker?: string
  sampleRate?: number
  format?: 'wav' | 'mp3' | 'ogg'
}

export interface SpeechState {
  isGenerating: boolean
  isPlaying: boolean
  currentAudio: HTMLAudioElement | null
  lastGeneratedUrl: string | null
  error: string | null
}

export const useSpeechStore = defineStore('speech', () => {
  // Configuration
  const sileroConfig = useLocalStorage<SileroTTSConfig>('speech/silero-config', {
    baseUrl: 'http://127.0.0.1:8001',
    speaker: 'baya',
    sampleRate: 48000,
    format: 'wav',
  })

  // State
  const state = ref<SpeechState>({
    isGenerating: false,
    isPlaying: false,
    currentAudio: null,
    lastGeneratedUrl: null,
    error: null,
  })

  // Available speakers (will be fetched from API)
  const availableSpeakers = ref<SileroSpeaker[]>([
    { name: 'baya', language: 'ru', gender: 'female', description: 'Женский голос Baya' },
    { name: 'aidar', language: 'ru', gender: 'male', description: 'Мужской голос Aidar' },
    { name: 'kseniya', language: 'ru', gender: 'female', description: 'Женский голос Kseniya' },
    { name: 'xenia', language: 'ru', gender: 'female', description: 'Женский голос Xenia' },
    { name: 'eugene', language: 'ru', gender: 'male', description: 'Мужской голос Eugene' },
  ])

  // Computed
  const currentSpeaker = computed(() =>
    availableSpeakers.value.find(s => s.name === sileroConfig.value.speaker) || availableSpeakers.value[0],
  )

  const isReady = computed(() => !!sileroConfig.value.baseUrl)

  // Actions
  async function fetchSpeakers(): Promise<void> {
    try {
      const response = await fetch(`${sileroConfig.value.baseUrl.replace(/\/$/, '')}/tts/speakers`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const speakers = await response.json()

      // Transform API response to our format
      if (Array.isArray(speakers)) {
        availableSpeakers.value = speakers.map(speaker => ({
          name: speaker.name || speaker,
          language: speaker.language || 'ru',
          gender: speaker.gender || 'female',
          description: speaker.description || `Голос ${speaker.name || speaker}`,
        }))
      }
    }
    catch (error) {
      console.error('Failed to fetch speakers:', error)
      // Keep default speakers if API fails
    }
  }

  async function generateSpeech(request: SpeechRequest): Promise<string> {
    if (!isReady.value) {
      throw new Error('Silero TTS не настроен')
    }

    state.value.isGenerating = true
    state.value.error = null

    try {
      const response = await fetch(`${sileroConfig.value.baseUrl.replace(/\/$/, '')}/tts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          speaker: request.speaker || sileroConfig.value.speaker,
          sample_rate: request.sampleRate || sileroConfig.value.sampleRate,
          format: request.format || sileroConfig.value.format,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Get audio data as blob
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      state.value.lastGeneratedUrl = audioUrl
      return audioUrl
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка'
      state.value.error = errorMessage
      throw error
    }
    finally {
      state.value.isGenerating = false
    }
  }

  async function playSpeech(audioUrl: string): Promise<void> {
    // Stop current audio if playing
    if (state.value.currentAudio) {
      state.value.currentAudio.pause()
      state.value.currentAudio = null
    }

    state.value.isPlaying = true
    state.value.error = null

    try {
      const audio = new Audio(audioUrl)
      state.value.currentAudio = audio

      return new Promise((resolve, reject) => {
        audio.onended = () => {
          state.value.isPlaying = false
          state.value.currentAudio = null
          resolve()
        }

        audio.onerror = () => {
          state.value.isPlaying = false
          state.value.currentAudio = null
          const error = new Error('Ошибка воспроизведения аудио')
          state.value.error = error.message
          reject(error)
        }

        audio.play().catch(reject)
      })
    }
    catch (error) {
      state.value.isPlaying = false
      state.value.currentAudio = null
      const errorMessage = error instanceof Error ? error.message : 'Ошибка воспроизведения'
      state.value.error = errorMessage
      throw error
    }
  }

  async function generateAndPlay(text: string): Promise<void> {
    const audioUrl = await generateSpeech({ text })
    await playSpeech(audioUrl)
  }

  function stopSpeech(): void {
    if (state.value.currentAudio) {
      state.value.currentAudio.pause()
      state.value.currentAudio = null
    }
    state.value.isPlaying = false
  }

  async function testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${sileroConfig.value.baseUrl.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })
      return response.ok
    }
    catch {
      return false
    }
  }

  async function playSample(speakerName?: string): Promise<void> {
    const speaker = speakerName || sileroConfig.value.speaker
    try {
      const response = await fetch(`${sileroConfig.value.baseUrl.replace(/\/$/, '')}/tts/sample?speaker=${speaker}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      await playSpeech(audioUrl)
    }
    catch (error) {
      console.error('Failed to play sample:', error)
      throw error
    }
  }

  // Update configuration
  function updateConfig(newConfig: Partial<SileroTTSConfig>): void {
    Object.assign(sileroConfig.value, newConfig)
  }

  // Initialize
  fetchSpeakers()

  return {
    // Configuration
    sileroConfig,

    // State
    state: computed(() => state.value),
    availableSpeakers: computed(() => availableSpeakers.value),
    currentSpeaker,
    isReady,

    // Actions
    fetchSpeakers,
    generateSpeech,
    playSpeech,
    generateAndPlay,
    stopSpeech,
    testConnection,
    playSample,
    updateConfig,
  }
})

export type SpeechStore = ReturnType<typeof useSpeechStore>
