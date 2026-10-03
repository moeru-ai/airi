import type { MaybeRefOrGetter, Ref } from 'vue'

import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { nextTick, onScopeDispose, ref, toValue, useId, watch } from 'vue'

import { useTranscriptionDraft } from './use-transcription-draft'

interface TranscriptionOptions {
  messageInputRef: Ref<string>
  sendMessage: () => void
  isStageTamagotchi: MaybeRefOrGetter<boolean>
  sessionId?: Readonly<Ref<string>>
}

export function useTranscriptions(options: TranscriptionOptions) {
  const { messageInputRef: messageInput, sendMessage, isStageTamagotchi } = options

  const hearingStore = useHearingStore()
  const audioDeviceSettingsStore = useSettingsAudioDevice()
  const hearingPipeline = useHearingSpeechInputPipeline()
  const { releaseStreamingTranscriptionConsumer, transcribeForMediaStream } = hearingPipeline
  const { supportsStreamInput } = storeToRefs(hearingPipeline)
  const { configured: hearingConfigured, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
  const { enabled: hearingEnabled, stream } = storeToRefs(audioDeviceSettingsStore)
  const providersStore = useProviderStore()
  const { askPermission, startStream } = audioDeviceSettingsStore

  const isListening = ref(false)
  const transcriptionConsumerId = `interactive-area:${useId()}`
  const {
    cancel: clearPendingAutoSend,
    append: appendTranscription,
    update: updateTranscription,
    clear: clearTranscription,
    receive: receiveTranscription,
  } = useTranscriptionDraft({
    draft: messageInput,
    enabled: autoSendEnabled,
    delay: autoSendDelay,
    send: sendMessage,
    sessionId: options.sessionId,
  })

  const stopStreaming = async () => {
    clearTranscription()
    clearPendingAutoSend()

    try {
      console.info('Stopping transcription...', { source: 'useTranscriptions' })
      await releaseStreamingTranscriptionConsumer(transcriptionConsumerId)
      isListening.value = false
      console.info('Transcription stopped', { source: 'useTranscriptions' })
    }
    catch (err) {
      console.error('Error stopping transcription:', err, { source: 'useTranscriptions' })
      isListening.value = false
    }
  }

  const startStreaming = async () => {
    console.info('Starting streaming transcription', {
      enabled: hearingEnabled.value,
      hasStream: !!stream.value,
      supportsStreamInput: supportsStreamInput.value,
      hearingConfigured: hearingConfigured.value,
    }, { source: 'useTranscriptions' })

    // Auto-configure Web Speech API as default if no provider is configured
    if (!hearingConfigured.value) {
      console.info('No transcription provider configured. Auto-configuring Web Speech API as default', { source: 'useTranscriptions' })
      // Check if Web Speech API is available in the browser
      // Web Speech API is NOT available in Electron (stage-tamagotchi) - it requires Google's embedded API keys
      // which are not available in Electron, causing it to fail at runtime
      const isWebSpeechAvailable = typeof window !== 'undefined'
        && !toValue(isStageTamagotchi) // Explicitly exclude Electron
        && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

      if (!isWebSpeechAvailable) {
        // TODO: also propagate to user
        const errorMsg = 'Web Speech API is not available and no transcription provider is configured. Please go to Settings > Modules > Hearing to configure a transcription provider. '
        console.error(errorMsg, 'Browser support:', {
          hasWindow: typeof window !== 'undefined',
          hasWebkitSpeechRecognition: typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
          hasSpeechRecognition: typeof window !== 'undefined' && 'SpeechRecognition' in window,
        }, { source: 'useTranscriptions' })
        isListening.value = false
        return
      }

      // Initialize the provider in the providers store first
      try {
        await providersStore.initializeProvider('browser-web-speech-api')
        hearingStore.activeTranscriptionProvider = 'browser-web-speech-api'
      }
      catch (err) {
        console.warn('Error initializing Web Speech API provider:', err, { source: 'useTranscriptions' })
      }
      // Wait for reactivity to update
      await nextTick()

      // Verify the provider was set to Web Speech API
      if (hearingStore.activeTranscriptionProvider !== 'browser-web-speech-api') {
        console.error('Failed to set Web Speech API as default provider', { source: 'useTranscriptions' })
        isListening.value = false
        return
      }
      console.info('Web Speech API configured as default provider', { source: 'useTranscriptions' })
    }

    // Check if streaming input is supported
    // TODO: implement non-streaming transcription
    if (!supportsStreamInput.value) {
      const errorMsg = 'Streaming input not supported by the selected transcription provider. Please select a provider that supports streaming (e.g., Web Speech API).'
      console.warn(errorMsg, { source: 'useTranscriptions' })
      isListening.value = false
      return
    }

    try {
      // Request microphone permission if needed (microphone should already be enabled by the user)
      if (!stream.value) {
        console.info('Requesting microphone permission', { source: 'useTranscriptions' })
        await askPermission()

        // If still no stream, try starting it manually
        if (!stream.value && hearingEnabled.value) {
          console.info('Attempting to start stream manually', { source: 'useTranscriptions' })
          startStream()
          // Wait for the stream to become available with a timeout.
          try {
            await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
          }
          catch {
            console.error('Timed out waiting for audio stream. Stopping transcription.', { source: 'useTranscriptions' })
            isListening.value = false
            return
          }
        }
      }
    }
    catch (err) {
      console.error('Failed to request microphone permission:', err, { source: 'useTranscriptions' })
      isListening.value = false
    }

    if (!stream.value) {
      const errorMsg = 'Failed to get audio stream for transcription. Please check microphone permissions and ensure a device is selected.'
      console.error(errorMsg, { source: 'useTranscriptions' })
      isListening.value = false
      return
    }

    console.info('Starting streaming transcription with stream:', stream.value.id, { source: 'useTranscriptions' })

    // Allow calling this even if already listening - transcribeForMediaStream will handle session reuse/restart
    // Call transcribeForMediaStream - it's async so we await it
    // Set listening state AFTER successful call
    try {
      await transcribeForMediaStream(stream.value, {
        consumerId: transcriptionConsumerId,
        onSentenceEnd: appendTranscription,
        onSpeechEnd: clearTranscription,
        onTranscriptionUpdate: updateTranscription,
      })

      // Only set listening to true if transcription started successfully
      // (transcribeForMediaStream might return early if session already exists)
      isListening.value = !hearingPipeline.error
      console.info('Streaming transcription initiated successfully', { source: 'useTranscriptions' })
    }
    catch (err) {
      clearTranscription()
      console.error('Transcription error:', err, { source: 'useTranscriptions' })
      isListening.value = false
      throw err
    }
  }

  watch(hearingEnabled, async (enabled) => {
    clearPendingAutoSend()
    if (!enabled) {
      await stopStreaming()
      console.info('Stopping streaming transcription because hearing is disabled.', { source: 'useTranscriptions' })
    }
  }, { flush: 'sync' })

  onScopeDispose(() => {
    clearPendingAutoSend()
    stopStreaming()
  })

  return {
    receiveTranscription,
    startStreamingTranscription: startStreaming,
    stopStreamingTranscription: stopStreaming,
    isListening,
    autoSendEnabled,
  }
}
