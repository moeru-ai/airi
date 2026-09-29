<script setup lang="ts">
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVoiceInlayStore } from '../../stores/voice-inlay'

const inlay = useVoiceInlayStore()
const cards = useAiriCardStore()
const { t } = useI18n()
const characterName = computed(() => cards.getCard(inlay.recordingCardId ?? '')?.name ?? '')
</script>

<template>
  <main v-if="inlay.recordingCardId" :class="['h-full w-full flex items-center justify-center']" role="status">
    <div
      :class="[
        'max-w-full min-w-0 flex items-center gap-2.5 rounded-full px-4 py-2.5',
        'bg-neutral-900/95 text-white shadow-lg dark:bg-neutral-100/95 dark:text-neutral-900',
      ]"
    >
      <span :class="['size-2.5 shrink-0 animate-pulse rounded-full bg-red-400 motion-reduce:animate-none']" />
      <span :class="['i-solar:microphone-bold size-4 shrink-0']" aria-hidden="true" />
      <span :class="['min-w-0 truncate text-sm font-medium']">{{ t('tamagotchi.stage.voice-inlay.recording') }}</span>
      <span v-if="characterName" :class="['min-w-0 truncate text-xs opacity-70']">{{ characterName }}</span>
    </div>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
