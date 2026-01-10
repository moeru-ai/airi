<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingTooltipOpen = ref(false)
const isComposing = ref(false)
const isListening = ref(false) // Transcription listening state (separate from microphone enabled)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission, startStream } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const { ingest, onAfterMessageComposed, discoverToolsCompatibility } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { audioContext } = useAudioContext()
const { t } = useI18n()

// Transcription pipeline
const hearingStore = useHearingStore()
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const { configured: hearingConfigured } = storeToRefs(hearingStore)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

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
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}

watch(hearingTooltipOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
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
  if (!hearingTooltipOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([hearingTooltipOpen, enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
  stopListening()
})

// Transcription listening functions
async function startListening() {
  if (isListening.value) {
    console.info('[ChatArea] Already listening, skipping...')
    return
  }

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
      const isWebSpeechAvailable = typeof window !== 'undefined'
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
          const errorMsg = 'Failed to configure transcription provider. Please go to Settings > Modules > Hearing to configure a transcription provider.'
          alert(errorMsg)
          isListening.value = false
          return
        }
      }
      else {
        const errorMsg = 'No transcription provider configured and Web Speech API is not available in this browser. Please go to Settings > Modules > Hearing to configure a transcription provider.'
        console.error('[ChatArea] Web Speech API not available. Browser support:', {
          hasWindow: typeof window !== 'undefined',
          hasWebkitSpeechRecognition: typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
          hasSpeechRecognition: typeof window !== 'undefined' && 'SpeechRecognition' in window,
        })
        alert(errorMsg)
        isListening.value = false
        return
      }
    }

    // Ensure microphone is enabled first (it's required for transcription)
    if (!enabled.value) {
      console.info('[ChatArea] Enabling microphone for transcription...')
      enabled.value = true
      // Wait longer for stream to initialize after enabling
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Request microphone permission if needed
    if (!stream.value) {
      console.info('[ChatArea] Requesting microphone permission...')
      await askPermission()
      // Wait for stream to initialize after permission request
      await new Promise(resolve => setTimeout(resolve, 500))

      // If still no stream, try starting it manually
      if (!stream.value && enabled.value) {
        console.info('[ChatArea] Attempting to start stream manually...')
        startStream()
        await new Promise(resolve => setTimeout(resolve, 500))
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
          }
        },
        onSpeechEnd: (text) => {
          if (text && text.trim()) {
            // Final transcription - ensure it's in the input
            const currentText = messageInput.value.trim()
            if (!currentText.includes(text.trim())) {
              messageInput.value = currentText ? `${currentText} ${text.trim()}` : text.trim()
            }
            console.info('[ChatArea] Speech ended, final text:', text)
          }
        },
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
    await stopStreamingTranscription(true)
    isListening.value = false
    console.info('[ChatArea] Transcription stopped')
  }
  catch (err) {
    console.error('[ChatArea] Error stopping transcription:', err)
    isListening.value = false
  }
}

async function toggleListening() {
  if (isListening.value) {
    await stopListening()
  }
  else {
    await startListening()
  }
}

// Stop listening if microphone is disabled
watch(enabled, (val) => {
  if (!val && isListening.value) {
    stopListening()
  }
})

// Stop listening if stream is lost
watch(stream, (val) => {
  if (!val && isListening.value) {
    stopListening()
  }
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
        :placeholder="t('stage.message')"
        text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
        bg="transparent"
        min-h="[100px]" max-h="[300px]" w-full
        rounded-t-xl p-4 font-medium pb="[60px]"
        outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
        :class="{
          'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
        }"
        @submit="handleSend"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />

      <!-- Bottom-left action buttons: Listening (transcription) and Microphone -->
      <div
        absolute bottom-2 left-2 z-10 flex items-center gap-2
      >
        <!-- Listening icon button for transcription -->
        <TooltipProvider :delay-duration="300">
          <TooltipRoot>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="h-8 w-8 flex items-center justify-center border rounded-md shadow-sm outline-none transition-all duration-200 active:scale-95"
                :class="isListening
                  ? ['bg-primary-500', 'text-white', 'border-primary-600', 'hover:bg-primary-600', 'dark:bg-primary-600', 'dark:border-primary-700', 'dark:hover:bg-primary-700']
                  : ['bg-white', 'text-neutral-600', 'border-neutral-300', 'hover:bg-neutral-50', 'dark:bg-neutral-800', 'dark:text-neutral-300', 'dark:border-neutral-600', 'dark:hover:bg-neutral-700']"
                :title="isListening ? 'Stop listening' : 'Start listening'"
                @click="toggleListening"
              >
                <Transition name="fade" mode="out-in">
                  <div v-if="isListening" class="i-solar:microphone-bold-duotone h-5 w-5" />
                  <div v-else class="i-solar:microphone-line-duotone h-5 w-5" />
                </Transition>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              :side-offset="8"
              class="rounded-lg bg-neutral-900 px-2 py-1 text-xs text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              {{ isListening ? 'Stop listening' : 'Start listening' }}
            </TooltipContent>
          </TooltipRoot>
        </TooltipProvider>

        <!-- Microphone icon button -->
        <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
          <TooltipRoot v-model:open="hearingTooltipOpen">
            <TooltipTrigger as-child>
              <button
                class="h-8 w-8 flex items-center justify-center rounded-md outline-none transition-all duration-200 active:scale-95"
                text="lg neutral-500 dark:neutral-400"
                :title="t('settings.hearing.title')"
              >
                <Transition name="fade" mode="out-in">
                  <IndicatorMicVolume v-if="enabled" class="h-5 w-5" />
                  <div v-else class="i-ph:microphone-slash h-5 w-5" />
                </Transition>
              </button>
            </TooltipTrigger>
            <Transition name="fade">
              <TooltipContent
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

                <FieldSelect
                  v-model="selectedAudioInput"
                  label="Input device"
                  description="Select the microphone you want to use."
                  :options="audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
                  layout="vertical"
                  placeholder="Select microphone"
                />
              </TooltipContent>
            </Transition>
          </TooltipRoot>
        </TooltipProvider>
      </div>
    </div>
  </div>
</template>
