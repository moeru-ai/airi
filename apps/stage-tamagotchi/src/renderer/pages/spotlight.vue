<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useWindowFocus } from '@vueuse/core'
import { ref, shallowRef, watch } from 'vue'

import {
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
} from '../../shared/eventa'
import { useChatSyncStore } from '../stores/chat-sync'

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const sending = shallowRef(false)
const inputRef = ref<HTMLInputElement>()

const chatSyncStore = useChatSyncStore()
const hideSpotlightWindow = useElectronEventaInvoke(electronSpotlightHide)
const showResultNotification = useElectronEventaInvoke(electronSpotlightShowResultNotification)

watch(useWindowFocus(), (focused) => {
  if (!focused) {
    messageInput.value = ''
    return
  }
  requestAnimationFrame(() => inputRef.value?.focus())
})

async function handleSend() {
  if (isComposing.value || sending.value)
    return

  const text = messageInput.value.trim()
  if (!text)
    return

  messageInput.value = ''
  sending.value = true

  try {
    await hideSpotlightWindow()
    const result = await chatSyncStore.requestSpotlightIngest({ text })
    await showResultNotification({
      body: result.visibleText.trim(),
    })
  }
  catch (error) {
    await showResultNotification({
      body: `出错啦：${errorMessageFrom(error) ?? '未知错误'}`,
    })
  }
  finally {
    sending.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void hideSpotlightWindow()
    return
  }

  if (event.key !== 'Enter' || isComposing.value)
    return

  event.preventDefault()
  void handleSend()
}
</script>

<template>
  <main
    :class="[
      'h-full w-full',
      'flex items-center justify-center',
      'bg-transparent px-5 py-5',
    ]"
  >
    <div
      :class="[
        'min-h-14 w-full',
        'flex items-center px-6',
        'rounded-full',
        'bg-white/88 dark:bg-neutral-900/88',
        'backdrop-blur-3xl backdrop-saturate-150',
        'shadow-lg shadow-black/20',
        'ring-1 ring-black/5 dark:ring-white/10',
      ]"
    >
      <input
        ref="inputRef"
        v-model="messageInput"
        :disabled="sending"
        autofocus
        type="text"
        placeholder="Ask AIRI…"
        :class="[
          'w-full bg-transparent',
          'text-lg outline-none',
          'text-neutral-900 dark:text-neutral-50',
          'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
        ]"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown="handleKeydown"
      >
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
