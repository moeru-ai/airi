<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { useMicVAD } from '@proj-airi/stage-ui/composables'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TamagotchiChatHistory from './ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])

// const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, discoverToolsCompatibility } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())

async function handleSend() {
  if (!messageInput.value.trim() && !attachments.value.length) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    const attachmentsToSend = attachments.value.map(({ data, mimeType, type }) => ({ data, mimeType, type }))
    await send(messageInput.value, {
      model: activeModel.value,
      chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
      providerConfig,
      attachments: attachmentsToSend,
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

async function handleFilePaste(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1]
        if (base64Data) {
          attachments.value.push({
            type: 'image' as const,
            data: base64Data,
            mimeType: file.type,
            url: URL.createObjectURL(file),
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

function removeAttachment(index: number) {
  const attachment = attachments.value[index]
  if (attachment) {
    URL.revokeObjectURL(attachment.url)
    attachments.value.splice(index, 1)
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

watch(enabled, async (value) => {
  if (value === false) {
    destroy()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

onAfterMessageComposed(async () => {
  messageInput.value = ''
  attachments.value.forEach(att => URL.revokeObjectURL(att.url))
  attachments.value = []
})

onMounted(() => {
  start()
})
</script>

<template>
  <div h-full w-full flex="~ col gap-1">
    <div w-full flex-1 overflow-hidden>
      <TamagotchiChatHistory />
    </div>
    <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 border-t border-primary-100 p-2">
      <div v-for="(attachment, index) in attachments" :key="index" class="relative">
        <img :src="attachment.url" class="h-20 w-20 rounded-md object-cover">
        <button class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-xs text-white" @click="removeAttachment(index)">
          &times;
        </button>
      </div>
    </div>
    <BasicTextarea
      v-model="messageInput"
      :placeholder="t('stage.message')"
      border="solid 2 primary-100"
      text="primary-400 hover:primary-600  placeholder:primary-400 placeholder:hover:primary-600"
      bg="primary-50 dark:primary-100" max-h="[10lh]" min-h="[1lh]"
      w-full shrink-0 resize-none overflow-y-scroll rounded-xl p-2 font-medium outline-none
      transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
      @submit="handleSend"
      @paste-file="handleFilePaste"
    />
  </div>
</template>
