<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { BasicTextarea } from '@proj-airi/stage-ui/components'
import { useMicVAD } from '@proj-airi/stage-ui/composables'
import { useChatStore, useConsciousnessStore, useProvidersStore, useSettings } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TamagotchiChatHistory from './ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)

// const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
// const { selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { send, onAfterSend } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())

async function handleSend() {
  if (!messageInput.value.trim()) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await send(messageInput.value, {
      model: activeModel.value,
      chatProvider: providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
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

function handleTranscription(_buffer: Float32Array) {
  // eslint-disable-next-line no-alert
  alert('Transcription is not implemented yet')
}

// async function handleAudioInputChange(event: Event) {
//   const target = event.target as HTMLSelectElement
//   const found = audioInputs.value.find(d => d.deviceId === target.value)
//   if (!found) {
//     selectedAudioDevice.value = undefined
//     return
//   }

//   selectedAudioDevice.value = found
// }

function openSettings() {
  window.electron.ipcRenderer.send('open-settings')
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
      <TamagotchiChatHistory transform="translate-y-[-100%]" absolute left-0 top-0 w-full />
      <div flex flex-1>
        <BasicTextarea
          v-model="messageInput"
          :placeholder="t('stage.message')"
          border="solid 2 primary-100"
          text="primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
          bg="primary-50 dark:[#3c2632]" max-h="[10lh]" min-h="[1lh]"
          w-full resize-none overflow-y-scroll rounded-l-xl p-2 font-medium outline-none
          transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
          @submit="handleSend"
        />
      </div>
      <div
        class="px-4 py-2.5"
        border="solid 2 primary-100 "
        text="lg primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
        bg="primary-50 dark:[#3c2632]" max-h="[10lh]" min-h="[1lh]"
        flex items-center justify-center rounded-r-xl
        @click="openSettings"
      >
        <div i-solar:settings-bold-duotone />
      </div>
    </div>
  </div>
</template>
