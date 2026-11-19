<script setup lang="ts">
import type { ChatHistoryItem } from '../../../../types/chat'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import HitPill from './hit-pill.vue'

import { extractMessageText } from '../../../../libs/chat-sync'

/** A stored notice, for example a finished background task. The owner did not write it, so it shows as a pill in the middle with its text folded. */
const props = withDefaults(defineProps<{
  message: Extract<ChatHistoryItem, { role: 'user' }>
  /** How the notice paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  surface: 'translucent',
})

const { t } = useI18n()

// A background task names itself `recipe:<name>`. Other sources show as they are.
const sourceName = computed(() => props.message.notice?.source.replace(/^recipe:/, '') ?? '')
const text = computed(() => extractMessageText(props.message))
</script>

<template>
  <HitPill :class="['py-1']" align="center" :icons="['i-mingcute:notification-fill']" :surface="props.surface">
    <template #label>
      {{ t('stage.chat.notice.label', { name: sourceName }) }}
    </template>
    <!-- A notice without text has nothing to unfold. -->
    <template v-if="text" #default>
      <p :class="['m-0 rounded-lg px-2.5 py-2 text-xs', 'whitespace-pre-wrap break-words', 'bg-white/75 dark:bg-neutral-800/60']">
        {{ text }}
      </p>
    </template>
  </HitPill>
</template>
