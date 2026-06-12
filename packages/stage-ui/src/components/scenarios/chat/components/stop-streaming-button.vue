<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useChatOrchestratorStore } from '../../../../stores/chat'

// Shared stop affordance for chat composers, rendered only while the active
// session is streaming (isActiveSessionStreaming, owned by the chat store and
// mirrored across the tamagotchi chat-sync relay). The stop transport differs
// per surface (orchestrator stopSending vs the tamagotchi chat-sync
// requestStop), and so does the toolbar chrome, so the button only emits and
// only carries the red stop identity; the caller owns the wiring, session
// scoping, and chrome (size, shape, background) so it matches its siblings.
const emit = defineEmits<{
  (e: 'stop'): void
}>()

const { t } = useI18n()
const { isActiveSessionStreaming } = storeToRefs(useChatOrchestratorStore())
</script>

<template>
  <button
    v-if="isActiveSessionStreaming"
    type="button"
    :class="[
      'flex items-center justify-center outline-none',
      'transition-colors transition-transform active:scale-95',
      'text-red-500 dark:text-red-400',
    ]"
    :title="t('stage.chat.actions.stop')"
    :aria-label="t('stage.chat.actions.stop')"
    @click="emit('stop')"
  >
    <div class="i-solar:stop-circle-bold-duotone" />
  </button>
</template>
