<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { useMicVAD } from '@proj-airi/stage-ui/composables'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { widgetsTools } from '../stores/tools/builtin/widgets'

const messageInput = ref('')
const listening = ref(false)
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput } = storeToRefs(useSettingsAudioDevice())
const chatStore = useChatStore()
const { send, onAfterMessageComposed, discoverToolsCompatibility, cleanupMessages } = chatStore
const { messages, sending, streamingMessage } = storeToRefs(chatStore)
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())
const isComposing = ref(false)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording, stopStreamingTranscription } = hearingPipeline

function float32ToWavFile(buffer: Float32Array, sampleRate = 16000) {
  const BITS_PER_SAMPLE = 16
  const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8
  const CHANNELS = 1
  const WAV_HEADER_SIZE = 44
  const FMT_CHUNK_SIZE = 16
  const PCM_FORMAT = 1

  const blockAlign = CHANNELS * BYTES_PER_SAMPLE
  const byteRate = sampleRate * blockAlign
  const dataLength = buffer.length * BYTES_PER_SAMPLE
  const bufferLength = WAV_HEADER_SIZE + dataLength

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF header
  writeString(0, 'RIFF')
  view.setUint32(4, WAV_HEADER_SIZE - 8 + dataLength, true)
  writeString(8, 'WAVE')

  // fmt chunk
  writeString(12, 'fmt ')
  view.setUint32(16, FMT_CHUNK_SIZE, true)
  view.setUint16(20, PCM_FORMAT, true)
  view.setUint16(22, CHANNELS, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, BITS_PER_SAMPLE, true)

  // data chunk
  writeString(36, 'data')
  view.setUint32(40, dataLength, true)

  let offset = WAV_HEADER_SIZE
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += BYTES_PER_SAMPLE
  }

  return new File([arrayBuffer], 'recording.wav', { type: 'audio/wav' })
}

async function handleSend() {
  if (isComposing.value) {
    return
  }

  if (!messageInput.value.trim() && !attachments.value.length) {
    return
  }

  const textToSend = messageInput.value
  const attachmentsToSend = attachments.value.map(att => ({ ...att }))

  // optimistic clear
  messageInput.value = ''
  attachments.value = []

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await send(textToSend, {
      model: activeModel.value,
      chatProvider: await providersStore.getProviderInstance<ChatProvider>(activeProvider.value),
      providerConfig,
      attachments: attachmentsToSend,
      tools: widgetsTools,
    })

    attachmentsToSend.forEach(att => URL.revokeObjectURL(att.url))
  }
  catch (error) {
    // restore on failure
    messageInput.value = textToSend
    attachments.value = attachmentsToSend.map(att => ({
      ...att,
      url: URL.createObjectURL(new Blob([Uint8Array.from(atob(att.data), c => c.charCodeAt(0))], { type: att.mimeType })),
    }))
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
    // Interrupt ongoing speech/transcription sessions
    void stopStreamingTranscription(true)
    listening.value = true
  },
  // VAD misfire means while speech end is detected but
  // the frames of the segment of the audio buffer
  // is not enough to be considered as a speech segment
  // which controlled by the `minSpeechFrames` parameter
  onVADMisfire: () => {
    listening.value = false
  },
  onSpeechEnd: (buffer: Float32Array) => {
    listening.value = false
    handleTranscription(buffer)
  },
  auto: false,
})

async function handleTranscription(buffer: Float32Array) {
  try {
    const recordingFile = float32ToWavFile(buffer)
    const text = await transcribeForRecording(recordingFile)
    if (typeof text === 'string' && text.trim())
      messageInput.value = text
  }
  catch (err) {
    console.error('Transcription failed', err)
  }
}

watch(enabled, async (value) => {
  if (value === false) {
    destroy()
  }
  else {
    await askPermission()
    start()
  }
}, {
  immediate: true,
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
}, { immediate: true })

onAfterMessageComposed(async () => {
  messageInput.value = ''
  attachments.value.forEach(att => URL.revokeObjectURL(att.url))
  attachments.value = []
})

const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])
</script>

<template>
  <div h-full w-full flex="~ col gap-1">
    <div w-full flex-1 overflow-hidden>
      <ChatHistory
        :messages="historyMessages"
        :sending="sending"
        :streaming-message="streamingMessage"
      />
    </div>
    <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 border-t border-primary-100 p-2">
      <div v-for="(attachment, index) in attachments" :key="index" class="relative">
        <img :src="attachment.url" class="h-20 w-20 rounded-md object-cover">
        <button class="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-xs text-white" @click="removeAttachment(index)">
          &times;
        </button>
      </div>
    </div>
    <div class="flex items-center justify-end gap-2 py-1">
      <button
        class="max-h-[10lh] min-h-[1lh]"
        bg="neutral-100 dark:neutral-800"
        text="lg neutral-500 dark:neutral-400"
        hover:text="red-500 dark:red-400"
        flex items-center justify-center rounded-md p-2 outline-none
        transition-colors transition-transform active:scale-95
        @click="() => cleanupMessages()"
      >
        <div class="i-solar:trash-bin-2-bold-duotone" />
      </button>
    </div>
    <BasicTextarea
      v-model="messageInput"
      :placeholder="t('stage.message')"
      class="ph-no-capture"
      text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
      border="solid 2 primary-200/20 dark:primary-400/20"
      bg="primary-100/50 dark:primary-900/70"
      max-h="[10lh]" min-h="[1lh]"
      w-full shrink-0 resize-none overflow-y-scroll rounded-xl p-2 font-medium outline-none
      transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      @keydown.enter.exact.prevent="handleSend"
      @paste-file="handleFilePaste"
    />
  </div>
</template>
