<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { useMicVAD } from '@proj-airi/stage-ui/composables'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { widgetsTools } from '../stores/tools/builtin/widgets'

import { useLocalStorage } from '@vueuse/core' // save the settings in the browser

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

// --- new feature ---
type SendMode = 'enter' | 'ctrl-enter' | 'double-enter' // define three sending modes

const sendMode = useLocalStorage<SendMode>('chat-send-mode', 'enter') // use useLocalStorage to make the browser remember the user's choice. The default is 'enter'
const showSendModeMenu = ref(false) // whether the menu is displayed

let lastEnterPressTime = 0 // timer of double-enter


function handleKeydown(e: KeyboardEvent) { // new key processing function

  if (isComposing.value) return

  const isEnter = e.key === 'Enter'
  const isCtrl = e.ctrlKey || e.metaKey

if (!isEnter) return

  // 1. Enter mode(default)
  if (sendMode.value === 'enter') {
    if (!e.shiftKey && !isCtrl) {
      e.preventDefault() // 
      handleSend()
      return
    }
  }

  // 2. Ctrl + Enter mode
  if (sendMode.value === 'ctrl-enter') {
    if (isCtrl) {
      e.preventDefault()
      handleSend()
      return
    }
  }

  // 3. Double Enter mode
  if (sendMode.value === 'double-enter') {
    if (!e.shiftKey && !isCtrl) {
      const now = Date.now()
      if (now - lastEnterPressTime < 300) {
        e.preventDefault() // prevent line break caused by the second press
        handleSend()
        lastEnterPressTime = 0
      } else {
        lastEnterPressTime = now
        // for the first time, don't stop it
      }
    }
  }
}
// --- end feature ---
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
      
      <div class="relative">
        <div 
          v-if="showSendModeMenu" 
          class="absolute bottom-full right-0 mb-2 w-max min-w-[140px] flex flex-col gap-1 overflow-hidden rounded-lg border border-primary-200 bg-white p-1 shadow-xl z-50 dark:border-primary-700 dark:bg-neutral-800"
        >
          <button 
            v-for="mode in ['enter', 'ctrl-enter', 'double-enter']" 
            :key="mode"
            class="px-3 py-2 text-left text-xs transition-colors hover:bg-primary-100 rounded-md dark:hover:bg-primary-900/50"
            :class="sendMode === mode ? 'text-primary-600 font-bold bg-primary-50 dark:bg-primary-900/20' : 'text-neutral-500'"
            @click="sendMode = mode as any; showSendModeMenu = false"
          >
            <span class="mr-1">{{ sendMode === mode ? '✓' : ' ' }}</span>
            {{ mode === 'enter' ? 'Enter' : mode === 'ctrl-enter' ? 'Ctrl + Enter' : 'Double-click Enter' }}
          </button>
        </div>

        <button
          class="max-h-[10lh] min-h-[1lh] flex items-center justify-center rounded-md p-2 outline-none transition-colors transition-transform active:scale-95"
          bg="neutral-100 dark:neutral-800"
          text="lg neutral-500 dark:neutral-400"
          hover="text-primary-500 dark:text-primary-400"
          :title="t('stage.message')"
          @click="showSendModeMenu = !showSendModeMenu"
        >
          <div class="i-solar:keyboard-bold-duotone" /> 
          </button>
      </div>

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
      @keydown="handleKeydown" 
      @paste-file="handleFilePaste"
    />
  </div>
</template>
