<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Shared stop affordance for chat composers. The stop transport differs per
// surface (orchestrator stopSending vs the tamagotchi chat-sync requestStop),
// so the button only emits; the caller owns the wiring and session scoping.
// Sizing comes from the caller via class passthrough.
const emit = defineEmits<{
  (e: 'stop'): void
}>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    :class="[
      'flex items-center justify-center rounded-md outline-none',
      'transition-colors transition-transform active:scale-95',
      'text-red-500 dark:text-red-400',
      'hover:bg-red-100/60 dark:hover:bg-red-900/40',
    ]"
    :title="t('stage.chat.actions.stop')"
    :aria-label="t('stage.chat.actions.stop')"
    @click="emit('stop')"
  >
    <div class="i-solar:stop-circle-bold-duotone" />
  </button>
</template>
