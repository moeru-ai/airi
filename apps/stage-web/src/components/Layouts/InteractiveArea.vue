<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea, FieldSelect } from '@proj-airi/ui'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatHistory from '../Widgets/ChatHistory.vue'
import IndicatorMicVolume from '../Widgets/IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingTooltipOpen = ref(false)
const isComposing = ref(false)

// Toggle states
const speechEnabled = ref(false)
const hearingEnabled = ref(false)
const imageInputEnabled = ref(false)

// File input ref
const fileInputRef = ref<HTMLInputElement>()

// Image upload state
const uploadedImages = ref<Array<{ id: string, dataUrl: string, fileName: string, isAnalyzing?: boolean, analysis?: string }>>([])

// Generate unique ID for images
function generateImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const hearingStore = useHearingStore()
const visionStore = useVisionStore()

const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, discoverToolsCompatibility, cleanupMessages } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const isDark = useDark({ disableTransition: false })

// Legacy whisper pipeline removed; audio pipeline handled at page level

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(messageInput.value, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  }
  catch (error) {
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}

async function handleImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) {
    return
  }

  try {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const imageData = e.target?.result as string
      const imageId = generateImageId()

      // Add image to preview list
      uploadedImages.value.push({
        id: imageId,
        dataUrl: imageData,
        fileName: file.name,
        isAnalyzing: true,
      })

      // Reset file input
      if (fileInputRef.value) {
        fileInputRef.value.value = ''
      }

      // Analyze image if vision is configured
      if (visionStore.configured) {
        try {
          const result = await visionStore.analyzeImageDirect(imageData, 'Analyze this image in detail.')

          // Update image with analysis result
          const imageIndex = uploadedImages.value.findIndex(img => img.id === imageId)
          if (imageIndex !== -1) {
            uploadedImages.value[imageIndex].isAnalyzing = false
            uploadedImages.value[imageIndex].analysis = result.content
          }
        }
        catch (error) {
          console.error('Vision analysis failed:', error)
          const imageIndex = uploadedImages.value.findIndex(img => img.id === imageId)
          if (imageIndex !== -1) {
            uploadedImages.value[imageIndex].isAnalyzing = false
            uploadedImages.value[imageIndex].analysis = `Analysis failed: ${(error as Error).message}`
          }
        }
      }
    }
    reader.readAsDataURL(file)
  }
  catch (error) {
    console.error('Error uploading image:', error)
  }
}

async function sendImageWithAnalysis(imageId: string) {
  const image = uploadedImages.value.find(img => img.id === imageId)
  if (!image || !image.analysis)
    return

  try {
    await send(`[Image: ${image.fileName}]\n[Analysis: ${image.analysis}]`, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig: providersStore.getProviderConfig(activeProvider.value),
    })

    // Remove image after sending
    uploadedImages.value = uploadedImages.value.filter(img => img.id !== imageId)
  }
  catch (error) {
    console.error('Failed to send image analysis:', error)
  }
}

function removeUploadedImage(imageId: string) {
  uploadedImages.value = uploadedImages.value.filter(img => img.id !== imageId)
}

async function handleSpeechToggle() {
  if (!speechEnabled.value) {
    speechEnabled.value = true
    // Enable speech synthesis when turned on
    // TODO: Initialize speech synthesis if needed
  }
  else {
    speechEnabled.value = false
    // Disable speech synthesis when turned off
    // TODO: Clean up speech synthesis if needed
  }
}

const vad = useMicVAD(selectedAudioInput, {
  onSpeechStart: () => {
    // TODO: interrupt the playback
    // TODO: interrupt any of the ongoing TTS
    // TODO: interrupt any of the ongoing LLM requests
    // TODO: interrupt any of the ongoing animation of Live2D or VRM
    // TODO: once interrupted, we should somehow switch to listen or thinking
    //       emotion / expression?
    listening.value = true
  },
  // VAD misfire means while speech end is detected but
  // the frames of the segment of the audio buffer
  // is not enough to be considered as a speech segment
  // which controlled by the `minSpeechFrames` parameter
  onVADMisfire: () => {
    // TODO: do audio buffer send to whisper
    listening.value = false
  },
  onSpeechEnd: (buffer) => {
    // TODO: do audio buffer send to whisper
    listening.value = false
    handleTranscription(buffer.buffer)
  },
  auto: false,
})

async function handleTranscription(buffer: ArrayBufferLike) {
  await audioContext.resume()

  // Convert Float32Array to WAV format
  const audioBase64 = await toWAVBase64(buffer, audioContext.sampleRate)
  generate({ type: 'generate', data: { audio: audioBase64, language: 'en' } })
}

watch(enabled, async (value) => {
  if (value === false) {
    vad.destroy()
    terminate()
  }
})

watch(showMicrophoneSelect, async (value) => {
  if (value) {
    await askPermission()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

// Define hearing toggle after VAD is defined
async function handleHearingToggle() {
  // Only request microphone permission when turning on hearing
  if (!hearingEnabled.value) {
    try {
      await askPermission()
      hearingEnabled.value = true
      // Start VAD when hearing is enabled
      vad.start()
    }
    catch (error) {
      console.error('Failed to get microphone permission:', error)
      // Show error to user or handle appropriately
    }
  }
  else {
    hearingEnabled.value = false
    // Stop VAD when hearing is disabled
    vad.destroy()
  }
}

onMounted(() => {
  // loadWhisper()
  // Don't start VAD automatically - only start when user enables hearing
  // vad.start()
})

onAfterMessageComposed(async () => {
  messageInput.value = ''
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
})
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <div
        flex="~ col"
        border="solid 4 primary-200/20 dark:primary-400/20"
        h-full w-full rounded-xl
        bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
      >
        <ChatHistory h-full flex-1 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
          <div flex="~ col" w-full>
            <BasicTextarea
              v-model="messageInput"
              :placeholder="t('stage.message')"
              text="primary-500 hover:primary-600 dark:primary-300/50 dark:hover:primary-500 placeholder:primary-400 placeholder:hover:primary-500 placeholder:dark:primary-300/50 placeholder:dark:hover:primary-500"
              bg="primary-200/20 dark:primary-400/20"
              min-h="[100px]" max-h="[300px]" w-full
              rounded-t-xl p-4 font-medium
              outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
              :class="{
                'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
              }"
              @submit="handleSend"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
            />

            <!-- Image Preview Area -->
            <div v-if="uploadedImages.length > 0" class="border-b border-t border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800">
              <div class="max-h-48 flex flex-col gap-2 overflow-y-auto">
                <div v-for="image in uploadedImages" :key="image.id" class="flex items-start gap-2 rounded-lg bg-white p-2 dark:bg-neutral-900">
                  <img :src="image.dataUrl" :alt="image.fileName" class="h-16 w-16 rounded object-cover">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium">
                      {{ image.fileName }}
                    </div>
                    <div v-if="image.isAnalyzing" class="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400">
                      <div class="i-solar:spinner-line-duotone animate-spin" />
                      Analyzing...
                    </div>
                    <div v-else-if="image.analysis" class="flex flex-col gap-1">
                      <div class="text-sm text-neutral-700 dark:text-neutral-300">
                        {{ image.analysis }}
                      </div>
                      <div class="flex gap-2">
                        <button
                          class="rounded bg-primary-500 px-2 py-1 text-xs text-white hover:bg-primary-600"
                          @click="sendImageWithAnalysis(image.id)"
                        >
                          Send
                        </button>
                        <button
                          class="rounded bg-neutral-500 px-2 py-1 text-xs text-white hover:bg-neutral-600"
                          @click="removeUploadedImage(image.id)"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div absolute bottom--8 right-0 flex gap-2>
      <button
        v-if="speechStore.configured"
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        :class="speechEnabled ? 'text-green-500 dark:text-green-400' : 'hover:text-green-500 dark:hover:text-green-400'"
        :title="speechEnabled ? 'Disable Speech' : 'Enable Speech'"
        @click="handleSpeechToggle"
      >
        <div class="i-solar:user-speak-rounded-bold-duotone" />
      </button>

      <button
        v-if="hearingStore.configured"
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        :class="hearingEnabled ? 'text-green-500 dark:text-green-400' : 'hover:text-green-500 dark:hover:text-green-400'"
        :title="hearingEnabled ? 'Disable Hearing' : 'Enable Hearing'"
        @click="handleHearingToggle"
      >
        <div class="i-solar:microphone-3-bold-duotone" />
      </button>

      <button
        v-if="visionStore.configured"
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        :class="imageInputEnabled ? 'text-blue-500 dark:text-blue-400' : 'hover:text-blue-500 dark:hover:text-blue-400'"
        :title="imageInputEnabled ? 'Disable Image Input' : 'Enable Image Input'"
        @click="imageInputEnabled = !imageInputEnabled"
      >
        <div class="i-solar:eye-bold-duotone" />
      </button>

      <!-- Hidden file input for image upload -->
      <input
        v-if="imageInputEnabled"
        ref="fileInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleImageUpload"
      >

      <button
        v-if="imageInputEnabled"
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="blue-500 dark:hover:text-blue-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        title="Upload Image"
        @click="fileInputRef?.click()"
      >
        <div class="i-solar:gallery-add-bold-duotone" />
      </button>

      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="cleanupMessages"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>

      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="isDark = !isDark"
      >
        <Transition name="fade" mode="out-in">
          <div v-if="isDark" i-solar:moon-bold />
          <div v-else i-solar:sun-2-bold />
        </Transition>
      </button>
    </div>
  </div>
</template>
