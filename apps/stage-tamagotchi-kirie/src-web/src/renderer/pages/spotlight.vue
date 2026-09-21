<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useHostSpotlightWindow } from '@proj-airi/stage-host-context'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync/wire-message'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useWindowFocus } from '@vueuse/core'
import { shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { artistryToolReferences } from '../stores/tools'

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const sending = shallowRef(false)
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')

const chatStore = useChatStore()
const chatSession = useChatSessionStore()
const { trackSpotlightUsed } = useAnalytics()
const { hide: hideSpotlightWindow, showResultNotification } = useHostSpotlightWindow()
const { t } = useI18n()

function focusMessageInput() {
  window.focus()
  inputRef.value?.focus()
}

watch(useWindowFocus(), (focused) => {
  if (!focused) {
    messageInput.value = ''
    return
  }
  requestAnimationFrame(focusMessageInput)
}, { immediate: true })

async function handleSend() {
  if (isComposing.value || sending.value)
    return

  const text = messageInput.value.trim()
  if (!text)
    return

  messageInput.value = ''
  sending.value = true
  trackSpotlightUsed()

  try {
    await hideSpotlightWindow()
    const result = await chatStore.send({
      sessionId: chatSession.activeSessionId,
      text,
      tools: artistryToolReferences,
    })
    const assistant = result.messages.findLast(message => message.role === 'assistant')
    const visibleText = assistant ? extractMessageText(assistant) : ''
    if (!visibleText.trim())
      throw new Error('Spotlight returned an empty response')

    await showResultNotification(visibleText.trim())
  }
  catch (error) {
    await showResultNotification(t('tamagotchi.spotlight.errors.prefix', {
      message: errorMessageFrom(error) ?? t('tamagotchi.spotlight.errors.unknown'),
    }))
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
        'spotlight-card relative overflow-hidden',
        'min-h-14 w-full',
        'flex items-center px-6',
        'rounded-full',
        'bg-white/88 dark:bg-neutral-900/88',
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
          'relative z-1',
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

<style scoped>
/* CEF OSR paints backdrop-blur and box-shadow against black, not the desktop. */
.spotlight-card::before {
  pointer-events: none;
  --at-apply: 'bg-gradient-to-r from-primary-500/25 via-primary-500/12 to-transparent dark:from-primary-400/25 dark:via-primary-400/12 dark:to-transparent';
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 85%;
  height: 100%;
  mask-image: linear-gradient(120deg, white 100%);
}

.spotlight-card::after {
  pointer-events: none;
  --at-apply: 'bg-dotted-[primary-300/35] dark:bg-dotted-[primary-200/16]';
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  background-size: 10px 10px;
  content: '';
  mask-image: linear-gradient(165deg, white 30%, transparent 55%);
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
