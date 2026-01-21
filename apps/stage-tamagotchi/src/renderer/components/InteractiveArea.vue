<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { ChatHistory } from '@proj-airi/stage-ui/components'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { widgetsTools } from '../stores/tools/builtin/widgets'

const messageInput = ref('')
const attachments = ref<{ type: 'image', data: string, mimeType: string, url: string }[]>([])

const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const { cleanupMessages } = useChatMaintenanceStore()
const { ingest, onAfterMessageComposed, discoverToolsCompatibility } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { sending } = storeToRefs(chatOrchestrator)
const { t } = useI18n()
const providersStore = useProvidersStore()
const { activeModel, activeProvider } = storeToRefs(useConsciousnessStore())
const isComposing = ref(false)

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
    await ingest(textToSend, {
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
