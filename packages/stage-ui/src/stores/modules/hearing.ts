import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useLocalStorage } from '@vueuse/core'
import { generateTranscription } from '@xsai/generate-transcription'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { KoboldCPPAudioRecorder, transcribeWithKoboldCPP } from '../../bindings/koboldcpp-whisper'
import { loadWhisperModel, transcribeAudio, WhisperAudioRecorder } from '../../bindings/tauri-whisper'
import { useProvidersStore } from '../providers'

export const useHearingStore = defineStore('hearing-store', () => {
  const providersStore = useProvidersStore()
  const { allAudioTranscriptionProvidersMetadata } = storeToRefs(providersStore)

  // State
  const activeTranscriptionProvider = useLocalStorage('settings/hearing/active-provider', '')
  const activeTranscriptionModel = useLocalStorage('settings/hearing/active-model', '')
  const activeCustomModelName = useLocalStorage('settings/hearing/active-custom-model', '')
  const transcriptionModelSearchQuery = ref('')

  // Computed properties
  const availableProvidersMetadata = computed(() => allAudioTranscriptionProvidersMetadata.value)

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeTranscriptionProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeTranscriptionProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeTranscriptionProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeTranscriptionProvider.value] || null
  })

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    return !!activeTranscriptionProvider.value && !!activeTranscriptionModel.value
  })

  // Additional state for new providers
  const whisperLanguage = useLocalStorage('settings/hearing/whisper-language', 'auto')
  const isRecording = ref(false)
  const audioRecorder = ref<WhisperAudioRecorder | KoboldCPPAudioRecorder | null>(null)

  async function transcription(
    provider: TranscriptionProviderWithExtraOptions<string, any>,
    model: string,
    file: File,
    format?: 'json' | 'verbose_json',
  ) {
    // Special handling for new providers
    if (activeTranscriptionProvider.value === 'tauri-whisper') {
      return await transcriptionWithTauriWhisper(file)
    }

    if (activeTranscriptionProvider.value === 'koboldcpp-whisper') {
      return await transcriptionWithKoboldCPP(file)
    }

    const response = await generateTranscription({
      ...provider.transcription(model),
      file,
      responseFormat: format,
    })

    return response
  }

  /**
   * Transcribe audio using Tauri Whisper
   */
  async function transcriptionWithTauriWhisper(file: File): Promise<string> {
    const config = providersStore.getProviderConfig('tauri-whisper')
    if (!config) {
      throw new Error('Tauri Whisper not configured')
    }

    // Convert file to float32 array
    const arrayBuffer = await file.arrayBuffer()
    const audioContext = new AudioContext()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    const chunk = Array.from(channelData)

    const language = whisperLanguage.value === 'auto' ? null : whisperLanguage.value

    return await transcribeAudio({ chunk, language })
  }

  /**
   * Transcribe audio using KoboldCPP Whisper
   */
  async function transcriptionWithKoboldCPP(file: File): Promise<string> {
    const config = providersStore.getProviderConfig('koboldcpp-whisper')
    if (!config?.baseUrl) {
      throw new Error('KoboldCPP Whisper base URL not configured')
    }

    const language = whisperLanguage.value === 'auto' ? undefined : whisperLanguage.value

    return await transcribeWithKoboldCPP(config.baseUrl as string, {
      file,
      language,
    })
  }

  /**
   * Start recording audio for transcription
   */
  async function startRecording(): Promise<void> {
    if (isRecording.value) {
      throw new Error('Already recording')
    }

    const provider = activeTranscriptionProvider.value

    if (provider === 'tauri-whisper') {
      audioRecorder.value = new WhisperAudioRecorder()
    }
    else if (provider === 'koboldcpp-whisper') {
      audioRecorder.value = new KoboldCPPAudioRecorder()
    }
    else {
      throw new Error(`Recording not supported for provider: ${provider}`)
    }

    await audioRecorder.value.startRecording()
    isRecording.value = true
  }

  /**
   * Stop recording and transcribe the audio
   */
  async function stopRecordingAndTranscribe(): Promise<string> {
    if (!isRecording.value || !audioRecorder.value) {
      throw new Error('Not currently recording')
    }

    try {
      const provider = activeTranscriptionProvider.value

      if (provider === 'tauri-whisper' && audioRecorder.value instanceof WhisperAudioRecorder) {
        const chunk = await audioRecorder.value.stopRecording()
        const language = whisperLanguage.value === 'auto' ? null : whisperLanguage.value
        return await transcribeAudio({ chunk, language })
      }
      else if (provider === 'koboldcpp-whisper' && audioRecorder.value instanceof KoboldCPPAudioRecorder) {
        const config = providersStore.getProviderConfig('koboldcpp-whisper')
        if (!config?.baseUrl) {
          throw new Error('KoboldCPP base URL not configured')
        }
        const language = whisperLanguage.value === 'auto' ? undefined : whisperLanguage.value
        return await audioRecorder.value.stopRecordingAndTranscribe(config.baseUrl as string, language)
      }
      else {
        throw new Error(`Unsupported recording provider: ${provider}`)
      }
    }
    finally {
      isRecording.value = false
      audioRecorder.value = null
    }
  }

  /**
   * Load Whisper model (for Tauri Whisper provider)
   */
  async function loadWhisperModelForProvider(): Promise<void> {
    if (activeTranscriptionProvider.value !== 'tauri-whisper') {
      throw new Error('This function is only for Tauri Whisper provider')
    }

    const config = providersStore.getProviderConfig('tauri-whisper')
    if (!config) {
      throw new Error('Tauri Whisper not configured')
    }

    await loadWhisperModel({
      modelType: (config.model as string) || 'medium',
    })
  }

  return {
    // State
    activeTranscriptionProvider,
    activeTranscriptionModel,
    availableProvidersMetadata,
    activeCustomModelName,
    transcriptionModelSearchQuery,
    whisperLanguage,
    isRecording,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    configured,

    // Actions
    transcription,
    transcriptionWithTauriWhisper,
    transcriptionWithKoboldCPP,
    loadModelsForProvider,
    getModelsForProvider,
    startRecording,
    stopRecordingAndTranscribe,
    loadWhisperModelForProvider,
  }
})
