<script setup lang="ts">
import type { ChatAssistantMessage } from '../../../../types/chat'

import { useI18n } from 'vue-i18n'

import HitPill from './hit-pill.vue'

import { TOOL_ICONS } from '../../../../tools/icons'

/**
 * The long-term memories that were saved after a reply. They show in the reply as a folded line, where the memory tool
 * calls of a reply show. Unfolding lists what was remembered.
 */
const props = defineProps<{
  memories: NonNullable<ChatAssistantMessage['savedMemories']>
}>()

const { t } = useI18n()
</script>

<template>
  <HitPill :icons="[TOOL_ICONS.memory]">
    <template #label>
      {{ t('stage.chat.saved-memory.label', { count: props.memories.length }) }}
    </template>
    <ul :class="['m-0 flex flex-col gap-1 list-none rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
      <li v-for="memory in props.memories" :key="memory.id" :class="['break-words']">
        {{ memory.description }}
      </li>
    </ul>
  </HitPill>
</template>
