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
  <!--
    Two lines in every row: the title, then the last message. The time is metadata, so the compact row of a desktop
    list shows it only in the tooltip of the row. The mobile row has no hover, so it keeps the time at the end of the
    second line.
  -->
  <span :class="['min-w-0 w-full flex-1']">
    <span :class="['block w-full truncate text-sm font-medium']">{{ props.row.preview }}</span>
    <span :class="['w-full flex items-center gap-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
      <span :class="['min-w-0 flex-1 truncate']">{{ props.row.lastMessage ?? '' }}</span>
      <span
        v-if="props.marks && props.row.meta.pinnedAt"
        role="img"
        :aria-label="t('stage.chat.sessions.pinned')"
        :title="t('stage.chat.sessions.pinned')"
        :class="['i-mingcute:pin-line size-3.5 shrink-0']"
      />
      <span v-if="!props.compact" :class="['shrink-0 text-neutral-400 dark:text-neutral-500']">{{ props.row.activityAtLabel }}</span>
      <span v-if="props.marks && props.row.isActive && !props.compact" :class="['shrink-0 text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
      <span :class="['sr-only']">{{ props.row.characterName }}</span>
    </span>
  </span>
</template>
