<script setup lang="ts">
import type { SessionRow } from './session-row-model'

import { useI18n } from 'vue-i18n'

/**
 * The title and the details line of a conversation row. The row places it in its select button.
 * The marks show the state of the conversation: the current conversation and its pin. A row in
 * selection mode leaves them out, so only its selection check marks it.
 */
const props = defineProps<{
  row: SessionRow
  compact: boolean
  marks: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <span :class="['min-w-0 flex-1']">
    <!-- The title and the time share the first line, and the last message takes the second line, as in a messenger. -->
    <span :class="['flex items-baseline gap-2']">
      <span :class="['min-w-0 flex-1 truncate text-sm font-medium']">{{ props.row.preview }}</span>
      <span
        v-if="props.marks && props.row.meta.pinnedAt"
        role="img"
        :aria-label="t('stage.chat.sessions.pinned')"
        :title="t('stage.chat.sessions.pinned')"
        :class="['i-mingcute:pin-line size-3.5 shrink-0 self-center text-neutral-400 dark:text-neutral-500']"
      />
      <span :class="['shrink-0 text-xs text-neutral-400 dark:text-neutral-500']">{{ props.row.activityAtLabel }}</span>
    </span>
    <span :class="['flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
      <span :class="['min-w-0 flex-1 truncate']">{{ props.row.lastMessage ?? '' }}</span>
      <span v-if="props.marks && props.row.isActive && !props.compact" :class="['shrink-0 text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
      <span :class="['sr-only']">{{ props.row.characterName }}</span>
    </span>
  </span>
</template>
