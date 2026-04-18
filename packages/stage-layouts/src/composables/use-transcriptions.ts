import type { MaybeRefOrGetter, Ref } from 'vue'

import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onScopeDispose, toValue, watch } from 'vue'

interface TranscriptionOptions {
  messageInputRef: Ref<string>
  sendMessage: () => void
  isListeningRef: Ref<boolean>
  isStageTamagotchi: MaybeRefOrGetter<boolean>
}

export function useTranscriptions(options: TranscriptionOptions) {
  const { messageInputRef: messageInput, sendMessage, isListeningRef: isListening, isStageTamagotchi } = options

  const hearingStore = useHearingStore()
  const hearingPipeline = useHearingSpeechInputPipeline()
  const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
  const { supportsStreamInput } = storeToRefs(hearingPipeline)
  const { configured: hearingConfigured, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
  const { enabled, stream } = storeToRefs(useSettingsAudioDevice())
  const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)
  const providersStore = useProvidersStore()
  const { askPermission, startStream } = useSettingsAudioDevice()

  // Auto-send logic
  let autoSendTimeout: ReturnType<typeof setTimeout> | undefined
  function clearPendingAutoSend() {
    if (autoSendTimeout) {
      clearTimeout(autoSendTimeout)
      autoSendTimeout = undefined
    }
  }
  async function debouncedAutoSend() {
    // Double-check auto-send is enabled before proceeding
    if (!autoSendEnabled.value) {
      clearPendingAutoSend()
      return
    }
    if (autoSendTimeout) {
      clearTimeout(autoSendTimeout)
    }

    autoSendTimeout = setTimeout(async () => {
      // Final check before sending - auto-send might have been disabled while waiting
      if (!autoSendEnabled.value) {
        clearPendingAutoSend()
        return
      }
      try {
        sendMessage()
      }
      catch (err) {
        console.error('[ChatArea] Auto-send error:', err)
        // Preserve any transcription that arrived while ingest was in flight (see PR review).
        // options.messageInputRef.value = [textToSend, options.messageInputRef.value.trim()].filter(Boolean).join(' ')
        // pendingAutoSendText.value = [textToSend, pendingAutoSendText.value.trim()].filter(Boolean).join(' ')
      }
      autoSendTimeout = undefined
    }, autoSendDelay.value)
  }

  const startListening = async () => {
  // Allow calling this even if already listening - transcribeForMediaStream will handle session reuse/restart
    try {
      console.info('[ChatArea] Starting listening...', {
        enabled: enabled.value,
        hasStream: !!stream.value,
        supportsStreamInput: supportsStreamInput.value,
        hearingConfigured: hearingConfigured.value,
      })

      // Auto-configure Web Speech API as default if no provider is configured
      if (!hearingConfigured.value) {
      // Check if Web Speech API is available in the browser
      // Web Speech API is NOT available in Electron (stage-tamagotchi) - it requires Google's embedded API keys
      // which are not available in Electron, causing it to fail at runtime
        const isWebSpeechAvailable = typeof window !== 'undefined'
          && !toValue(isStageTamagotchi) // Explicitly exclude Electron
          && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

        if (isWebSpeechAvailable) {
          console.info('[ChatArea] No transcription provider configured. Auto-configuring Web Speech API as default...')

          // Initialize the provider in the providers store first
          try {
            providersStore.initializeProvider('browser-web-speech-api')
          }
          catch (err) {
            console.warn('[ChatArea] Error initializing Web Speech API provider:', err)
          }
          hearingStore.activeTranscriptionProvider = 'browser-web-speech-api'

          // Wait for reactivity to update
          await nextTick()

          // Verify the provider was set correctly
          if (hearingStore.activeTranscriptionProvider === 'browser-web-speech-api') {
            console.info('[ChatArea] Web Speech API configured as default provider')
          }
          else {
            console.error('[ChatArea] Failed to set Web Speech API as default provider')
            isListening.value = false
            return
          }
        }
        else {
          console.error('[ChatArea] Web Speech API not available. No transcription provider configured and Web Speech API is not available in this browser. Please go to Settings > Modules > Hearing to configure a transcription provider. Browser support:', {
            hasWindow: typeof window !== 'undefined',
            hasWebkitSpeechRecognition: typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
            hasSpeechRecognition: typeof window !== 'undefined' && 'SpeechRecognition' in window,
          })
          isListening.value = false
          return
        }
      }

      // Request microphone permission if needed (microphone should already be enabled by the user)
      if (!stream.value) {
        console.info('[ChatArea] Requesting microphone permission...')
        await askPermission()

        // If still no stream, try starting it manually
        if (!stream.value && enabled.value) {
          console.info('[ChatArea] Attempting to start stream manually...')
          startStream()
          // Wait for the stream to become available with a timeout.
          try {
            await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
          }
          catch {
            console.error('[ChatArea] Timed out waiting for audio stream.')
            isListening.value = false
            return
          }
        }
      }

      if (!stream.value) {
        const errorMsg = 'Failed to get audio stream for transcription. Please check microphone permissions and ensure a device is selected.'
        console.error('[ChatArea]', errorMsg)
        isListening.value = false
        return
      }

      // Check if streaming input is supported
      if (!shouldUseStreamInput.value) {
        const errorMsg = 'Streaming input not supported by the selected transcription provider. Please select a provider that supports streaming (e.g., Web Speech API).'
        console.warn('[ChatArea]', errorMsg)
        // Clean up any existing sessions from other pages (e.g., test page) that might interfere
        await stopStreamingTranscription(true)
        isListening.value = false
        return
      }

      console.info('[ChatArea] Starting streaming transcription with stream:', stream.value.id)

      // Call transcribeForMediaStream - it's async so we await it
      // Set listening state AFTER successful call
      try {
        await transcribeForMediaStream(stream.value, {
          onSentenceEnd: (delta) => {
            if (delta && delta.trim()) {
              console.info('[ChatArea] Received transcription delta:', delta)
              // Append transcribed text to message input
              const currentText = messageInput.value.trim()
              messageInput.value = currentText ? `${currentText} ${delta}` : delta
              debouncedAutoSend()
            }
          },
        // Omit onSpeechEnd to avoid re-adding user-deleted text; use sentence deltas only.
        })

        // Only set listening to true if transcription started successfully
        // (transcribeForMediaStream might return early if session already exists)
        isListening.value = true
        console.info('[ChatArea] Streaming transcription initiated successfully')
      }
      catch (err) {
        console.error('[ChatArea] Transcription error:', err)
        isListening.value = false
        throw err
      }
    }
    catch (err) {
      console.error('[ChatArea] Failed to start transcription:', err)
      isListening.value = false
    }
  }

  const stopListening = async () => {
    if (!isListening.value)
      return

    try {
      console.info('[ChatArea] Stopping transcription...')
      clearPendingAutoSend()
      await stopStreamingTranscription(true)
      isListening.value = false
      console.info('[ChatArea] Transcription stopped')
    }
    catch (err) {
      console.error('[ChatArea] Error stopping transcription:', err)
      isListening.value = false
    }
  }

  // Watch for auto-send setting changes and clear pending sends if disabled
  watch(autoSendEnabled, (enabled) => {
    if (!enabled) {
      clearPendingAutoSend()
      console.info('[ChatArea] Auto-send disabled')
    }
  })

  // Start listening when microphone is enabled and stream is available
  watch(enabled, async (enabled) => {
    if (enabled && stream.value) {
    // Microphone was just enabled and we have a stream, start transcription
      await startListening()
    }
    else if (!enabled && isListening.value) {
    // Microphone was disabled, stop transcription
      await stopListening()
    }
  })

  // Start listening when stream becomes available (if microphone is enabled)
  watch(stream, async (stream) => {
    if (stream && enabled.value && !isListening.value) {
    // Stream became available and microphone is enabled, start transcription
      await startListening()
    }
    else if (!stream && isListening.value) {
    // Stream was lost, stop transcription
      await stopListening()
    }
  })

  onScopeDispose(() => {
    clearPendingAutoSend()
    stopListening()
  })

  return {
    startListening,
    stopListening,
  }
}
