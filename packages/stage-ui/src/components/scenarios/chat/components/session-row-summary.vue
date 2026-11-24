<script setup lang="ts">
import type { SessionRow } from './session-row-model'

import { formatISO } from 'date-fns'
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
    Two lines in every row: the title with the time of the last message, then the last message. The time stands at the
    end of the title line, as in a messenger, so the user can tell the conversations apart without opening them.
  -->
  <span :class="['min-w-0 w-full flex-1']">
    <span :class="['w-full flex items-baseline gap-2']">
      <span :class="['min-w-0 flex-1 truncate text-sm font-medium']">{{ props.row.preview }}</span>
      <time
        :datetime="formatISO(props.row.activityAt)"
        :title="props.row.activityAtTitle"
        :class="['shrink-0 text-xs font-normal tabular-nums text-neutral-400 dark:text-neutral-500']"
      >
        {{ props.row.activityAtLabel }}
      </time>
    </span>
    <span :class="['w-full flex items-center gap-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400', props.compact ? 'mt-0.5' : 'mt-1']">
      <span :class="['min-w-0 flex-1 truncate']">{{ props.row.lastMessage ?? '' }}</span>
      <span
        v-if="props.marks && props.row.meta.pinnedAt"
        role="img"
        :aria-label="t('stage.chat.sessions.pinned')"
        :title="t('stage.chat.sessions.pinned')"
        :class="['i-mingcute:pin-line size-3.5 shrink-0']"
      />
      <span v-if="props.marks && props.row.isActive && !props.compact" :class="['shrink-0 text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
      <span :class="['sr-only']">{{ props.row.characterName }}</span>
    </span>
  </span>
</template>
