<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useWindowFocus } from '@vueuse/core'
import { shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronSpotlightHide,
  electronSpotlightShowResultNotification,
} from '../../shared/eventa'
import { useChatSyncStore } from '../stores/chat-sync'

const messageInput = shallowRef('')
const isComposing = shallowRef(false)
const sending = shallowRef(false)
const inputRef = useTemplateRef<HTMLInputElement>('inputRef')

const chatSyncStore = useChatSyncStore()
const { trackSpotlightUsed } = useAnalytics()
const hideSpotlightWindow = useElectronEventaInvoke(electronSpotlightHide)
const showResultNotification = useElectronEventaInvoke(electronSpotlightShowResultNotification)
const { t } = useI18n()

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
  trackSpotlightUsed()

  try {
    await hideSpotlightWindow()
    const result = await chatSyncStore.requestSpotlightIngest({ text })
    await showResultNotification({
      body: result.visibleText.trim(),
    })
  }
  catch (error) {
    await showResultNotification({
      body: t('tamagotchi.spotlight.errors.prefix', {
        message: errorMessageFrom(error) ?? t('tamagotchi.spotlight.errors.unknown'),
      }),
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
        'spotlight-card relative overflow-hidden',
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
