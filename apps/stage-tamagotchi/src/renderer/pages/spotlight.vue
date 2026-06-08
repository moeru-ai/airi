<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { BasicTextarea } from '@proj-airi/ui'
import { shallowRef } from 'vue'

import {
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
} from '../../shared/eventa'
import { useChatSyncStore } from '../stores/chat-sync'

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const sending = shallowRef(false)

const chatSyncStore = useChatSyncStore()
const hideSpotlightWindow = useElectronEventaInvoke(electronSpotlightHide)
const showResultNotification = useElectronEventaInvoke(electronSpotlightShowResultNotification)

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
    // The OS notification center truncates the body itself; clicking opens the
    // full reply in the Chat window, so we hand it the whole visible text.
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

async function handleHide() {
  await hideSpotlightWindow()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void handleHide()
    return
  }

  if (event.key !== 'Enter' || event.shiftKey || isComposing.value)
    return

  event.preventDefault()
  void handleSend()
}
</script>

<template>
  <main
    :class="[
      'h-full w-full overflow-hidden',
      'flex items-center gap-3',
      'px-5 py-4',
      'bg-white/82 text-neutral-900',
      'dark:bg-neutral-950/78 dark:text-neutral-50',
    ]"
  >
    <div
      :class="[
        'h-10 w-10 shrink-0',
        'flex items-center justify-center',
        'rounded-lg',
        'bg-primary-500/12 text-primary-600',
        'dark:bg-primary-400/16 dark:text-primary-200',
      ]"
    >
      <div class="i-solar:chat-round-dots-bold-duotone text-6" />
    </div>

    <BasicTextarea
      v-model="messageInput"
      :submit-on-enter="false"
      :disabled="sending"
      autofocus
      default-height="52px"
      placeholder="AIRI"
      :class="[
        'h-full min-h-13 max-h-24 w-full',
        'resize-none overflow-y-auto',
        'rounded-md border border-neutral-300/70',
        'bg-white/70 px-3 py-2',
        'text-base text-neutral-900 outline-none',
        'placeholder:text-neutral-400',
        'transition-colors',
        'focus:border-primary-400 focus:bg-white/92',
        'dark:border-neutral-700/80 dark:bg-neutral-900/72',
        'dark:text-neutral-50 dark:placeholder:text-neutral-500',
        'dark:focus:border-primary-300 dark:focus:bg-neutral-900/92',
      ]"
      @compositionstart="isComposing = true"
      @compositionend="isComposing = false"
      @keydown="handleKeydown"
    />
  </main>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
