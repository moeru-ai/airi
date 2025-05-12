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
const { t } = useI18n()

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  const providerConfig = providersStore.getProviderConfig(activeProvider.value)

  await send(messageInput.value, {
    chatProvider: providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
    model: activeModel.value,
    providerConfig,
  })
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
  <div>
    <div relative w-full flex gap-1>
      <MobileChatHistory absolute left-0 top-0 transform="translate-y-[-100%]" w-full />
      <div flex flex-1>
        <BasicTextarea
          v-model="messageInput"
          :placeholder="t('stage.message')"
          border="solid 2 primary-100 dark:primary-400/20"
          text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500 placeholder:primary-300 placeholder:hover:primary-500 placeholder:dark:primary-300/50 placeholder:dark:hover:primary-500"
          bg="primary-100 dark:primary-400/20"
          max-h="[10lh]" min-h="[1lh]"
          w-full resize-none overflow-y-scroll rounded-xl p-2 font-medium outline-none
          transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
          :class="{ 'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic }"
          @submit="handleSend"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
        />
      </div>
    </div>
  </div>
</template>
