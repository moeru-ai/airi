import type { MaybeRefOrGetter, Ref } from 'vue'

import { useStreamingTranscriptionInput } from '@proj-airi/stage-ui/composables/use-streaming-transcription-input'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { nextTick, onScopeDispose, ref, toValue, useId, watch } from 'vue'

interface TranscriptionOptions {
  messageInputRef: Ref<string>
  sendMessage: () => void
  isStageTamagotchi: MaybeRefOrGetter<boolean>
}

export function useTranscriptions(options: TranscriptionOptions) {
  const { messageInputRef: messageInput, sendMessage, isStageTamagotchi } = options

  const hearingStore = useHearingStore()
  const audioDeviceSettingsStore = useSettingsAudioDevice()
  const hearingPipeline = useHearingSpeechInputPipeline()
  const { removeStreamingTranscriptionConsumer, hasStreamingTranscriptionConsumers, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
  const { supportsStreamInput } = storeToRefs(hearingPipeline)
  const { configured: hearingConfigured, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
  const { enabled: hearingEnabled, stream } = storeToRefs(audioDeviceSettingsStore)
  const providersStore = useProviderStore()
  const { askPermission, startStream } = audioDeviceSettingsStore

  const isListening = ref(false)
  const transcriptionConsumerId = `interactive-area:${useId()}`
  const streamingInput = useStreamingTranscriptionInput(messageInput)

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
      sendMessage()
      autoSendTimeout = undefined
    }, autoSendDelay.value)
  }

  // Startup is asynchronous: it can await a permission prompt, provider
  // initialization, a stream that takes seconds to arrive, and session setup.
  // Teardown cannot cancel that work through `isListening`, which stays false
  // until the last step, so `stopStreaming` would return early and the pending
  // start would then register its consumer and activate a session after the
  // surface stopped wanting one. Every resume point therefore revalidates the
  // start, and the two ways a start goes stale need opposite handling.
  let disposed = false
  let latestStartGeneration = 0

  /**
   * Serializes start and stop so neither observes the other mid-flight.
   *
   * Vue does not serialize watcher runs, so a rapid off/on can begin a
   * replacement start while the previous stop is still settling. For VAD
   * providers `stopStreamingTranscription` disposes the old session and awaits
   * its lifecycle before stopping the current realtime session, so a stop that
   * overlaps a start aborts the session that start just created, and its
   * trailing `isListening = false` clears the replacement's state. Queueing
   * makes each operation observe the previous one's finished state.
   */
  let pendingOperation: Promise<unknown> = Promise.resolve()

  function enqueueOperation<T>(operation: () => Promise<T>) {
    // Chain off settlement, not success, so one failure cannot wedge the queue.
    const result = pendingOperation.then(operation, operation)
    pendingOperation = result.catch(() => undefined)
    return result
  }

  /**
   * A newer start replaced this one, which happens when the microphone is
   * toggled off and on again before startup settles. Both starts share this
   * composable's single consumer id, so the superseded one must not touch the
   * registration or the session: the newer start owns both. The generation is
   * what keeps the old start invalidated, because `hearingEnabled` alone reads
   * as valid again the moment the flag flips back to true.
   */
  function startSuperseded(generation: number) {
    return generation !== latestStartGeneration
  }

  /** True once the surface no longer wants an active transcription session. */
  function startCancelled() {
    return disposed || !hearingEnabled.value
  }

  /** Releases a session created by a start that was cancelled mid-flight. */
  const discardCancelledSession = async () => {
    removeStreamingTranscriptionConsumer(transcriptionConsumerId)
    streamingInput.clear()
    clearPendingAutoSend()

    // A different chat surface can own the shared session: a breakpoint change
    // swaps InteractiveArea for MobileInteractiveArea, and the replacement
    // registers its own consumer while this start is still settling. Stopping
    // is global, so doing it here would tear down that surface's session and
    // leave it marked listening with nothing running behind it.
    if (hasStreamingTranscriptionConsumers()) {
      console.info('Leaving the streaming session to its remaining consumers', { source: 'useTranscriptions' })
      return
    }

    try {
      await stopStreamingTranscription(true)
    }
    catch (err) {
      console.error('Error discarding cancelled transcription session:', err, { source: 'useTranscriptions' })
    }
  }

  const stopStreaming = async () => {
    removeStreamingTranscriptionConsumer(transcriptionConsumerId)
    streamingInput.clear()

    if (!isListening.value)
      return

    try {
      console.info('Stopping transcription...', { source: 'useTranscriptions' })
      clearPendingAutoSend()

      // Same global-stop hazard as discardCancelledSession: a replacement
      // surface may already have registered against this session.
      if (hasStreamingTranscriptionConsumers()) {
        isListening.value = false
        console.info('Released the streaming session to its remaining consumers', { source: 'useTranscriptions' })
        return
      }

      await stopStreamingTranscription(true)
      isListening.value = false
      console.info('Transcription stopped', { source: 'useTranscriptions' })
    }
    catch (err) {
      console.error('Error stopping transcription:', err, { source: 'useTranscriptions' })
      isListening.value = false
    }
  }

  const startStreaming = async () => {
    const generation = ++latestStartGeneration

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

    // Provider setup awaited above. Leave `isListening` untouched when the
    // start is cancelled: a newer start may already own the session.
    if (startSuperseded(generation) || startCancelled()) {
      console.info('Abandoning transcription start: it was superseded or the microphone is no longer active', { source: 'useTranscriptions' })
      return
    }

    // Check if streaming input is supported
    // TODO: implement non-streaming transcription
    if (!supportsStreamInput.value) {
      const errorMsg = 'Streaming input not supported by the selected transcription provider. Please select a provider that supports streaming (e.g., Web Speech API).'
      console.warn(errorMsg, { source: 'useTranscriptions' })
      // Clean up any existing sessions from other pages (e.g., test page) that might interfere
      await stopStreamingTranscription(true)
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

    // The permission prompt and the stream wait above can span seconds, which
    // is the widest window for the microphone to be turned off again.
    if (startSuperseded(generation) || startCancelled()) {
      console.info('Abandoning transcription start: it was superseded or the microphone is no longer active', { source: 'useTranscriptions' })
      return
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
      const startResult = await transcribeForMediaStream(stream.value, {
        consumerId: transcriptionConsumerId,
        onSentenceEnd: (delta) => {
          if (streamingInput.commit(delta)) {
            console.info('Received final transcription:', delta, { source: 'useTranscriptions' })
            debouncedAutoSend()
          }
        },
        onSpeechEnd: streamingInput.clear,
        onTranscriptionUpdate: streamingInput.replace,
      })

      // A newer start owns the shared consumer registration and the session it
      // established, so this one exits without disturbing either.
      if (startSuperseded(generation)) {
        console.info('Abandoning transcription start: a newer start owns the session', { source: 'useTranscriptions' })
        return
      }

      // The consumer is registered and the session is live at this point, so a
      // cancellation observed now has to be undone rather than returned from.
      if (startCancelled()) {
        console.info('Discarding transcription session: microphone input was turned off during startup', { source: 'useTranscriptions' })
        await discardCancelledSession()
        return
      }

      // transcribeForMediaStream reports provider-configuration and session
      // construction failures in its result and resolves normally, so the catch
      // below never sees them. Without this check a failed startup would be
      // marked as listening with no session behind it, and because startup is
      // driven only by the microphone flag nothing would retry until the user
      // toggled it. The result is read instead of the store's shared `error`
      // ref, which a concurrent call can overwrite while this one waits.
      if (!startResult.started) {
        console.error('Transcription pipeline reported a startup failure:', startResult.error, { source: 'useTranscriptions' })
        streamingInput.clear()
        removeStreamingTranscriptionConsumer(transcriptionConsumerId)
        isListening.value = false
        return
      }

      // Only set listening to true if transcription started successfully
      // (transcribeForMediaStream might return early if session already exists)
      isListening.value = true
      console.info('Streaming transcription initiated successfully', { source: 'useTranscriptions' })
    }
    catch (err) {
      streamingInput.clear()
      console.error('Transcription error:', err, { source: 'useTranscriptions' })
      isListening.value = false
      throw err
    }
  }

  // Watch for auto-send setting changes and clear pending sends if disabled
  watch(autoSendEnabled, (enabled) => {
    if (!enabled) {
      clearPendingAutoSend()
      console.info('Auto-send disabled', { source: 'useTranscriptions' })
    }
  })

  // The chat surface owns streaming transcription: the microphone `enabled`
  // state is the only entry point. The manual transcription toggle was removed
  // from HearingConfig in #2014, so without this watcher live speech input can
  // never start. Page-level audio pipelines (stage-web/stage-pocket index
  // pages) keep the recorder-based path for providers without stream input and
  // must not register their own streaming consumers.
  watch(hearingEnabled, async (enabled, wasEnabled) => {
    if (enabled) {
      try {
        await enqueueOperation(startStreaming)
      }
      catch (err) {
        console.error('Failed to start streaming transcription on microphone enable:', err, { source: 'useTranscriptions' })
      }
      return
    }

    // Skip the initial run: there is no session to stop yet.
    if (wasEnabled !== undefined) {
      await enqueueOperation(stopStreaming)
      console.info('Stopping streaming transcription because hearing is disabled.', { source: 'useTranscriptions' })
    }
  }, { immediate: true })

  onScopeDispose(() => {
    // Set before stopping so a start still in flight sees the disposal and
    // releases whatever session it goes on to create.
    disposed = true
    clearPendingAutoSend()
    void enqueueOperation(stopStreaming)
  })

  return {
    // Queued so external callers cannot interleave with the watcher either.
    startStreamingTranscription: () => enqueueOperation(startStreaming),
    stopStreamingTranscription: () => enqueueOperation(stopStreaming),
    isListening,
    autoSendEnabled,
  }
}
