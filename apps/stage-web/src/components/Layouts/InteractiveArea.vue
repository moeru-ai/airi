<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import WhisperWorker from '@proj-airi/stage-ui/libs/workers/worker?worker&url'

import { toWAVBase64 } from '@proj-airi/audio'
import { useMicVAD, useWhisper } from '@proj-airi/stage-ui/composables'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatHistory from '../Widgets/ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const showMicrophoneSelect = ref(false)
const isComposing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, discoverToolsCompatibility, cleanupMessages } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const isDark = useDark({ disableTransition: false })

const { transcribe: generate, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (res) => {
    if (!res || !res.trim()) {
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(res, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  },
})

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const userMessage = messageInput.value.trim()
  messageInput.value = '' // Clear input immediately

  try {
    console.warn('InteractiveArea - Starting send process')
    console.warn('InteractiveArea - Active provider:', activeProvider.value)
    console.warn('InteractiveArea - Active model:', activeModel.value)
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    console.warn('InteractiveArea - Provider config:', providerConfig)
    console.warn('InteractiveArea - Configured providers:', providersStore.configuredProviders)

    await send(userMessage, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })

    console.warn('InteractiveArea - Send completed successfully')
  }
  catch (error) {
    console.error('InteractiveArea - Send error:', error)
    // Add error message to chat instead of popping user message
    messages.value.push({
      role: 'error',
      content: `Error sending message: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

const { destroy, start } = useMicVAD(selectedAudioInput, {
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
    destroy()
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

onMounted(async () => {
  // loadWhisper()
  start()

  // Initialize zunvra.com provider automatically
  await providersStore.initializeProvider('sofia-zunvra')
})

onAfterMessageComposed(async () => {
  messageInput.value = ''
})
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <div
        flex="~ col"
        border="solid 4 primary-200/20 dark:primary-400/20"
        h-full w-full overflow-scroll rounded-xl
        bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
      >
        <ChatHistory h-full flex-1 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
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
        </div>
      </div>
    </div>

    <div absolute bottom--8 right-0 flex gap-2>
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
