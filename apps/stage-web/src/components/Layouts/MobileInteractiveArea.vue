<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { useMicVAD } from '@proj-airi/stage-ui/composables'
import { useChatStore, useConsciousnessStore, useProvidersStore, useSettings } from '@proj-airi/stage-ui/stores'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MobileChatHistory from '../Widgets/MobileChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const isComposing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())

// const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
// const { selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { isAudioInputOn, selectedAudioDeviceId, themeColorsHueDynamic } = storeToRefs(useSettings())
const { send, onAfterSend } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { t } = useI18n()

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(messageInput.value, {
      chatProvider: providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
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

const { destroy, start } = useMicVAD(selectedAudioDeviceId, {
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

watch(isAudioInputOn, async (value) => {
  if (value === 'false') {
    destroy()
  }
})

onAfterSend(async () => {
  messageInput.value = ''
})

onMounted(() => {
  start()
})
</script>

<template>
  <div fixed bottom-0 w-full flex gap-1 max-w="[calc(100dvw-1rem)]">
    <MobileChatHistory absolute left-0 top-0 transform="translate-y-[-100%]" h="80dvh" w-full />
    <div flex flex-1 gap-1>
      <BasicTextarea
        v-model="messageInput"
        :placeholder="t('stage.message')"
        border="solid 2 primary-50 dark:primary-950/10"
        text="primary-500 hover:primary-600 dark:primary-100 dark:hover:primary-200 placeholder:primary-400 placeholder:hover:primary-500 placeholder:dark:primary-300 placeholder:dark:hover:primary-400"
        bg="primary-50/80 dark:primary-950/80"
        max-h="[10lh]" min-h="[calc(1lh+4px+4px)]"
        w-full resize-none overflow-y-scroll rounded="[1lh]" px-4 py-0.5 outline-none backdrop-blur-md scrollbar-none
        transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
        :class="[themeColorsHueDynamic ? 'transition-colors-none placeholder:transition-colors-none' : '']"
        default-height="1lh"
        @submit="handleSend"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
      <button

        v-if="messageInput.trim() || isComposing"
        w="[calc(1lh+4px+4px)]" h="[calc(1lh+4px+4px)]" aspect-square flex items-center self-end justify-center rounded-full outline-none backdrop-blur-md
        text="primary-500 hover:primary-600 dark:primary-100 dark:hover:primary-200 placeholder:primary-400 placeholder:hover:primary-500 placeholder:dark:primary-300 placeholder:dark:hover:primary-400"
        bg="primary-50/80 dark:primary-950/80"
        @click="handleSend"
      >
        <div i-solar:arrow-up-outline />
      </button>
    </div>
  </div>
</template>
