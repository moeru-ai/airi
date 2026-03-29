<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, FieldCombobox } from '@proj-airi/ui'
import { until, useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger, PopoverContent, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingPopoverOpen = ref(false)
const isComposing = ref(false)
const isListening = ref(false) // Transcription listening state (separate from microphone enabled)
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const lastEnterTime = ref(0)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission, startStream } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const { ingest, onAfterMessageComposed } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { audioContext } = useAudioContext()
const { t } = useI18n()
const sendModeLabels = computed<Record<SendMode, string>>(() => ({
  'enter': t('stage.send-mode.enter'),
  'ctrl-enter': t('stage.send-mode.ctrl-enter'),
  'double-enter': t('stage.send-mode.double-enter'),
}))

// Transcription pipeline
const hearingStore = useHearingStore()
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const { configured: hearingConfigured, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

// Auto-send logic
let autoSendTimeout: ReturnType<typeof setTimeout> | undefined
const pendingAutoSendText = ref('')

function clearPendingAutoSend() {
  if (autoSendTimeout) {
    clearTimeout(autoSendTimeout)
    autoSendTimeout = undefined
  }
  pendingAutoSendText.value = ''
}

async function debouncedAutoSend(text: string) {
  // Double-check auto-send is enabled before proceeding
  if (!autoSendEnabled.value) {
    clearPendingAutoSend()
    return
  }

  // Add text to pending buffer
  pendingAutoSendText.value = pendingAutoSendText.value ? `${pendingAutoSendText.value} ${text}` : text

  // Clear existing timeout
  if (autoSendTimeout) {
    clearTimeout(autoSendTimeout)
  }

  // Set new timeout
  autoSendTimeout = setTimeout(async () => {
    // Final check before sending - auto-send might have been disabled while waiting
    if (!autoSendEnabled.value) {
      clearPendingAutoSend()
      return
    }

    const textToSend = pendingAutoSendText.value.trim()
    if (textToSend && autoSendEnabled.value) {
      try {
        // `ingest()` resolves only after the full assistant turn finishes; clear UI/buffer now so
        // the next SentenceEnd during streaming does not append to the message we already committed.
        messageInput.value = ''
        pendingAutoSendText.value = ''
        const providerConfig = providersStore.getProviderConfig(activeProvider.value)
        await ingest(textToSend, {
          chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
          model: activeModel.value,
          providerConfig,
        })
      }
      catch (err) {
        console.error('[ChatArea] Auto-send error:', err)
        // Preserve any transcription that arrived while ingest was in flight (see PR review).
        messageInput.value = [textToSend, messageInput.value.trim()].filter(Boolean).join(' ')
        pendingAutoSendText.value = [textToSend, pendingAutoSendText.value.trim()].filter(Boolean).join(' ')
      }
    }
    autoSendTimeout = undefined
  }, autoSendDelay.value)
}

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const textToSend = messageInput.value
  messageInput.value = ''

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await ingest(textToSend, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  }
  catch (error) {
    messageInput.value = textToSend
    chatSession.setSessionMessages(chatSession.activeSessionId, [
      ...messages.value.slice(0, -1),
      {
        role: 'error',
        content: errorMessageFrom(error) ?? 'Failed to send message',
      },
    ])
  }
}

function sendFromKeyboard() {
  messageInput.value = messageInput.value.replace(TRAILING_NEWLINES_REGEX, '')
  void handleSend()
}

function handleMessageInputKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.key !== 'Enter')
    return

  const hasControl = event.ctrlKey || event.metaKey
  const hasShift = event.shiftKey

  switch (sendMode.value) {
    case 'enter':
      if (!hasShift && !hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'ctrl-enter':
      if (hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'double-enter':
      if (!hasShift && !hasControl) {
        const now = Date.now()
        if (now - lastEnterTime.value < DOUBLE_ENTER_INTERVAL_MS) {
          event.preventDefault()
          sendFromKeyboard()
          lastEnterTime.value = 0
        }
        else {
          lastEnterTime.value = now
        }
      }
  }
}

watch(hearingPopoverOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

onAfterMessageComposed(async () => {
})

const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()
const normalizedVolume = computed(() => Math.min(1, Math.max(0, (volumeLevel.value ?? 0) / 100)))
let analyzerSource: MediaStreamAudioSourceNode | undefined

function teardownAnalyzer() {
  try {
    analyzerSource?.disconnect()
  }
  catch {}
  analyzerSource = undefined
  stopAnalyzer()
}

async function setupAnalyzer() {
  teardownAnalyzer()
  if (!hearingPopoverOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([hearingPopoverOpen, enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
  stopListening()

  // Clear auto-send timeout on unmount
  if (autoSendTimeout) {
    clearTimeout(autoSendTimeout)
    autoSendTimeout = undefined
  }
})

// Transcription listening functions
async function startListening() {
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
        && !isStageTamagotchi() // Explicitly exclude Electron
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

        // Set as active provider
        hearingStore.activeTranscriptionProvider = 'browser-web-speech-api'

        // Wait for reactivity to update
        await nextTick()

        // Verify the provider was set correctly
        if (hearingStore.activeTranscriptionProvider === 'browser-web-speech-api') {
          console.info('[ChatArea] Web Speech API configured as default provider')
          // Continue with transcription - Web Speech API is ready
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
            // Append transcribed text to message input
            const currentText = messageInput.value.trim()
            messageInput.value = currentText ? `${currentText} ${delta}` : delta
            console.info('[ChatArea] Received transcription delta:', delta)

            // Auto-send if enabled - check the current value (not captured in closure)
            // This ensures we always respect the current setting, even if callbacks are reused
            if (autoSendEnabled.value) {
              debouncedAutoSend(delta)
            }
            else {
              // If auto-send is disabled, clear any pending auto-send text to prevent accidental sends
              clearPendingAutoSend()
            }
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
      throw err // Re-throw to be caught by outer catch
    }
  }
  catch (err) {
    console.error('[ChatArea] Failed to start transcription:', err)
    isListening.value = false
  }
}

async function stopListening() {
  if (!isListening.value)
    return

  try {
    console.info('[ChatArea] Stopping transcription...')

    // Clear auto-send timeout
    clearPendingAutoSend()

    // Send any pending text immediately if auto-send is enabled
    if (autoSendEnabled.value && pendingAutoSendText.value.trim()) {
      const textToSend = pendingAutoSendText.value.trim()
      pendingAutoSendText.value = ''
      try {
        const providerConfig = providersStore.getProviderConfig(activeProvider.value)
        await ingest(textToSend, {
          chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
          model: activeModel.value,
          providerConfig,
        })
        messageInput.value = ''
      }
      catch (err) {
        console.error('[ChatArea] Auto-send error on stop:', err)
      }
    }

    await stopStreamingTranscription(true)
    isListening.value = false
    console.info('[ChatArea] Transcription stopped')
  }
  catch (err) {
    console.error('[ChatArea] Error stopping transcription:', err)
    isListening.value = false
  }
}

// Start listening when microphone is enabled and stream is available
watch(enabled, async (val) => {
  if (val && stream.value) {
    // Microphone was just enabled and we have a stream, start transcription
    await startListening()
  }
  else if (!val && isListening.value) {
    // Microphone was disabled, stop transcription
    await stopListening()
  }
})

// Start listening when stream becomes available (if microphone is enabled)
watch(stream, async (val) => {
  if (val && enabled.value && !isListening.value) {
    // Stream became available and microphone is enabled, start transcription
    await startListening()
  }
  else if (!val && isListening.value) {
    // Stream was lost, stop transcription
    await stopListening()
  }
})

// Watch for auto-send setting changes and clear pending sends if disabled
watch(autoSendEnabled, (enabled) => {
  if (!enabled) {
    // Auto-send was disabled - clear any pending auto-send
    clearPendingAutoSend()
    console.info('[ChatArea] Auto-send disabled, cleared pending text')
  }
})

watch(sendMode, () => {
  lastEnterTime.value = 0
})
</script>

<template>
  <div h="<md:full" flex gap-2 class="ph-no-capture">
    <div
      :class="[
        'relative',
        'w-full',
        'bg-primary-200/20 dark:bg-primary-400/20',
      ]"
    >
      <BasicTextarea
        v-model="messageInput"
        :submit-on-enter="false"
        :placeholder="t('stage.message')"
        text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
        bg="transparent"
        min-h="[100px]" max-h="[300px]" w-full
        rounded-t-xl p-4 font-medium pb="[60px]"
        outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
        :class="{
          'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
        }"
        @keydown="handleMessageInputKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />

      <!-- Bottom-left action button: Microphone -->
      <div
        absolute bottom-2 left-2 z-10 flex items-center gap-2
      >
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button
              :class="[
                'h-8 w-8 flex items-center justify-center rounded-md outline-none transition-all duration-200 active:scale-95',
                'text-lg text-neutral-500 dark:text-neutral-400',
              ]"
              :title="t('stage.send-mode.title')"
            >
              <div class="i-solar:keyboard-bold-duotone h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              side="top"
              align="start"
              :side-offset="8"
              :class="[
                'z-50 min-w-[180px] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-1',
                'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
                'flex flex-col gap-1',
              ]"
            >
              <DropdownMenuItem
                v-for="mode in SEND_MODES"
                :key="mode"
                :class="[
                  'w-full flex cursor-pointer items-center rounded-lg px-3 py-2 text-xs outline-none transition-colors',
                  'hover:bg-primary-100/60 dark:hover:bg-primary-900/40',
                  sendMode === mode ? 'bg-primary-100/60 text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-300' : 'text-neutral-600 dark:text-neutral-300',
                ]"
                @select="sendMode = mode"
              >
                <div class="mr-2 h-4 w-4 flex items-center justify-center">
                  <div v-if="sendMode === mode" class="i-ph:check-bold h-4 w-4" />
                </div>
                <span>{{ sendModeLabels[mode] }}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>

        <!-- Microphone icon button -->
        <PopoverRoot v-model:open="hearingPopoverOpen">
          <PopoverTrigger as-child>
            <button
              :class="[
                'h-8 w-8 flex items-center justify-center rounded-md outline-none',
                'transition-all duration-200 active:scale-95',
              ]"
              text="lg neutral-500 dark:neutral-400"
              :title="t('settings.hearing.title')"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" class="h-5 w-5" />
                <div v-else class="i-ph:microphone-slash h-5 w-5" />
              </Transition>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            :side-offset="8"
            :class="[
              'w-72 max-w-[18rem] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-4',
              'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
              'flex flex-col gap-3',
            ]"
          >
            <div class="flex flex-col items-center justify-center">
              <div class="relative h-28 w-28 select-none">
                <div
                  class="absolute left-1/2 top-1/2 h-20 w-20 rounded-full transition-all duration-150 -translate-x-1/2 -translate-y-1/2"
                  :style="{ transform: `translate(-50%, -50%) scale(${1 + normalizedVolume * 0.35})`, opacity: String(0.25 + normalizedVolume * 0.25) }"
                  :class="enabled ? 'bg-primary-500/15 dark:bg-primary-600/20' : 'bg-neutral-300/20 dark:bg-neutral-700/20'"
                />
                <div
                  class="absolute left-1/2 top-1/2 h-24 w-24 rounded-full transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
                  :style="{ transform: `translate(-50%, -50%) scale(${1.2 + normalizedVolume * 0.55})`, opacity: String(0.15 + normalizedVolume * 0.2) }"
                  :class="enabled ? 'bg-primary-500/10 dark:bg-primary-600/15' : 'bg-neutral-300/10 dark:bg-neutral-700/10'"
                />
                <div
                  class="absolute left-1/2 top-1/2 h-28 w-28 rounded-full transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
                  :style="{ transform: `translate(-50%, -50%) scale(${1.5 + normalizedVolume * 0.8})`, opacity: String(0.08 + normalizedVolume * 0.15) }"
                  :class="enabled ? 'bg-primary-500/5 dark:bg-primary-600/10' : 'bg-neutral-300/5 dark:bg-neutral-700/5'"
                />
                <button
                  class="absolute left-1/2 top-1/2 grid h-16 w-16 place-items-center rounded-full shadow-md outline-none transition-all duration-200 -translate-x-1/2 -translate-y-1/2"
                  :class="enabled
                    ? 'bg-primary-500 text-white hover:bg-primary-600 active:scale-95'
                    : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 active:scale-95 dark:bg-neutral-700 dark:text-neutral-200'"
                  @click="enabled = !enabled"
                >
                  <div :class="enabled ? 'i-ph:microphone' : 'i-ph:microphone-slash'" class="h-6 w-6" />
                </button>
              </div>
              <p class="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                {{ enabled ? 'Microphone enabled' : 'Microphone disabled' }}
              </p>
            </div>

            <FieldCombobox
              v-model="selectedAudioInput"
              label="Input device"
              description="Select the microphone you want to use."
              :options="audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
              layout="vertical"
              placeholder="Select microphone"
            />
          </PopoverContent>
        </PopoverRoot>
      </div>
    </div>
  </div>
</template>
