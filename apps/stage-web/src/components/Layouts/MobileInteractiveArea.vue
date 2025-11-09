<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { useDark, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import IndicatorMicVolume from '../Widgets/IndicatorMicVolume.vue'
import MobileChatHistory from '../Widgets/MobileChatHistory.vue'
import ActionAbout from './InteractiveArea/Actions/About.vue'
import ActionViewControls from './InteractiveArea/Actions/ViewControls.vue'
import ViewControlInputs from './ViewControls/Inputs.vue'

const isDark = useDark({ disableTransition: false })
const hearingDialogOpen = ref(false)

const viewControlsActiveMode = ref<'x' | 'y' | 'z' | 'scale'>('scale')
const viewControlsInputsRef = useTemplateRef<InstanceType<typeof ViewControlInputs>>('viewControlsInputs')

const messageInput = ref('')
const isComposing = ref(false)

// Toggle states
const speechEnabled = ref(false)
const hearingEnabled = ref(false)
const imageInputEnabled = ref(false)

// File input ref
const fileInputRef = ref<HTMLInputElement>()

const screenSafeArea = useScreenSafeArea()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const hearingStore = useHearingStore()
const visionStore = useVisionStore()

const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

useResizeObserver(document.documentElement, () => screenSafeArea.update())

const { askPermission } = useSettingsAudioDevice()
const { themeColorsHueDynamic, stageViewControlsEnabled } = storeToRefs(useSettings())
const settingsAudioDevice = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(settingsAudioDevice)
const { send, onAfterMessageComposed, discoverToolsCompatibility, cleanupMessages } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { t } = useI18n()
const { audioContext } = useAudioContext()
const { startAnalyzer, stopAnalyzer, volumeLevel } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

async function handleSubmit() {
  if (!isMobileDevice()) {
    await handleSend()
  }
}

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
    // Convert image to base64 for vision analysis
    const reader = new FileReader()
    reader.onload = async (e) => {
      const imageData = e.target?.result as string

      // Send image to vision analysis
      if (visionStore.configured) {
        try {
          const result = await visionStore.analyzeImageDirect(imageData, 'Analyze this image in detail.')

          // Add analysis result to chat
          await send(`[Image Analysis: ${result.content}]`, {
            chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
            model: activeModel.value,
            providerConfig: providersStore.getProviderConfig(activeProvider.value),
          })
        }
        catch (error) {
          console.error('Vision analysis failed:', error)
          // Add error message to chat
          await send(`Image analysis failed: ${(error as Error).message}`, {
            chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
            model: activeModel.value,
            providerConfig: providersStore.getProviderConfig(activeProvider.value),
          })
        }
      }
    }
    reader.readAsDataURL(file)

    // Reset file input
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
  catch (error) {
    console.error('Error uploading image:', error)
  }
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
    handleTranscription(buffer)
  },
  auto: false,
})

function handleTranscription(_buffer: Float32Array<ArrayBufferLike>) {
  // eslint-disable-next-line no-alert
  alert('Transcription is not implemented yet')
}

watch(enabled, async (value) => {
  if (value === false) {
    vad.destroy()
  }
})

onAfterMessageComposed(async () => {
  messageInput.value = ''
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
  // Don't start VAD automatically - only start when user enables hearing
  // vad.start()
  screenSafeArea.update()
})
</script>

<template>
  <div fixed bottom-0 w-full flex flex-col>
    <KeepAlive>
      <Transition name="fade">
        <MobileChatHistory v-if="!stageViewControlsEnabled" max-w="[calc(100%-3.5rem)]" w-full self-start pl-3 />
      </Transition>
    </KeepAlive>
    <div relative w-full self-end>
      <div top="50%" translate-y="[-50%]" fixed z-15 px-3>
        <ViewControlInputs ref="viewControlsInputs" :mode="viewControlsActiveMode" />
      </div>
      <div translate-y="[-100%]" absolute right-0 w-full px-3 pb-3 font-sans>
        <div flex="~ col" w-full gap-1>
          <ActionAbout />

          <!-- Speech Toggle Button -->
          <button
            v-if="speechStore.configured"
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            :title="speechEnabled ? 'Disable Speech' : 'Enable Speech'"
            @click="handleSpeechToggle"
          >
            <div
              size-5
              :class="speechEnabled ? 'text-green-500 dark:text-green-400' : 'text-neutral-500 dark:neutral-400'"
              class="i-solar:user-speak-rounded-bold-duotone"
            />
          </button>

          <!-- Hearing Toggle Button -->
          <button
            v-if="hearingStore.configured"
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            :title="hearingEnabled ? 'Disable Hearing' : 'Enable Hearing'"
            @click="handleHearingToggle"
          >
            <div
              size-5
              :class="hearingEnabled ? 'text-green-500 dark:text-green-400' : 'text-neutral-500 dark:neutral-400'"
              class="i-solar:microphone-3-bold-duotone"
            />
          </button>

          <!-- Vision/Image Input Toggle Button -->
          <button
            v-if="visionStore.configured"
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            :title="imageInputEnabled ? 'Disable Image Input' : 'Enable Image Input'"
            @click="imageInputEnabled = !imageInputEnabled"
          >
            <div
              size-5
              :class="imageInputEnabled ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-500 dark:neutral-400'"
              class="i-solar:eye-bold-duotone"
            />
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

          <!-- Image Upload Button (shown when image input is enabled) -->
          <button
            v-if="imageInputEnabled"
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Upload Image"
            @click="fileInputRef?.click()"
          >
            <div size-5 text="neutral-500 dark:neutral-400" class="i-solar:gallery-add-bold-duotone" />
          </button>

          <!-- Theme Toggle Button -->
          <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Theme" @click="isDark = !isDark">
            <Transition name="fade" mode="out-in">
              <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-500 dark:neutral-400" />
              <div v-else i-solar:sun-2-outline size-5 text="neutral-500 dark:neutral-400" />
            </Transition>
          </button>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Language">
            <div i-solar:earth-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <RouterLink to="/settings" border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Settings">
            <div i-solar:settings-outline size-5 text="neutral-500 dark:neutral-400" />
          </RouterLink>
          <!-- <button border="2 solid neutral-100/60 dark:neutral-800/30" bg="neutral-50/70 dark:neutral-800/70" w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md title="Model">
            <div i-solar:face-scan-circle-outline size-5 text="neutral-500 dark:neutral-400" />
          </button> -->
          <ActionViewControls v-model="viewControlsActiveMode" @reset="() => viewControlsInputsRef?.resetOnMode()" />
          <button
            border="2 solid neutral-100/60 dark:neutral-800/30"
            bg="neutral-50/70 dark:neutral-800/70"
            w-fit flex items-center self-end justify-center rounded-xl p-2 backdrop-blur-md
            title="Cleanup Messages"
            @click="cleanupMessages"
          >
            <div class="i-solar:trash-bin-2-bold-duotone" />
          </button>
        </div>
      </div>
      <div bg="white dark:neutral-800" max-h-100dvh max-w-100dvw w-full flex gap-1 overflow-auto px-3 pt-2 :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 12)}px` }">
        <BasicTextarea
          v-model="messageInput"
          :placeholder="t('stage.message')"
          border="solid 2 neutral-200/60 dark:neutral-700/60"
          text="neutral-500 hover:neutral-600 dark:neutral-100 dark:hover:neutral-200 placeholder:neutral-400 placeholder:hover:neutral-500 placeholder:dark:neutral-300 placeholder:dark:hover:neutral-400"
          bg="neutral-100/80 dark:neutral-950/80"
          max-h="[10lh]" min-h="[calc(1lh+4px+4px)]"
          w-full resize-none overflow-y-scroll rounded="[1lh]" px-4 py-0.5 outline-none backdrop-blur-md scrollbar-none
          transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
          :class="[themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : '']"
          default-height="1lh"
          @submit="handleSubmit"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
        <button
          v-if="messageInput.trim() || isComposing"
          w="[calc(1lh+4px+4px)]" h="[calc(1lh+4px+4px)]" aspect-square flex items-center self-end justify-center rounded-full outline-none backdrop-blur-md
          text="neutral-500 hover:neutral-600 dark:neutral-900 dark:hover:neutral-800"
          bg="primary-50/80 dark:neutral-100/80 hover:neutral-50"
          transition="all duration-250 ease-in-out"
          @click="handleSend"
        >
          <div i-solar:arrow-up-outline />
        </button>
      </div>
    </div>
  </div>
</template>
